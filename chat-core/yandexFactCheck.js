/**
 * Проверка фактов черновика ответа через Yandex Cloud LLM до polish (Alice).
 * Те же Api-Key и каталог, что у russianStylePolish; модель по умолчанию — YandexGPT.
 *
 * По умолчанию в коде ВЫКЛЮЧЕНО (YANDEX_FACT_CHECK_ENABLED_IN_CODE): «судья» часто переписывал ответ.
 * Включить без правки кода: YANDEX_FACT_CHECK_ENABLED=true (и ключ/каталог Yandex Cloud).
 * Явно выключить при включённом коде: YANDEX_FACT_CHECK_DISABLED=true или YANDEX_FACT_CHECK_ENABLED=false
 */
const {
  yandexApiKeyForPolish,
  yandexFolderForPolish,
  yandexResponsesUrl,
  yandexChatCompletionsUrl,
  extractAssistantTextFromYandexResponse,
} = require("./russianStylePolish");

const DEFAULT_FACT_CHECK_MODEL = "yandexgpt-5.1/latest";

/** false — шаг Yandex LLM-судья не вызывается, пока не задано YANDEX_FACT_CHECK_ENABLED=true в env. */
const YANDEX_FACT_CHECK_ENABLED_IN_CODE = false;

function isYandexFactCheckForcedOnByEnv() {
  const v = (process.env.YANDEX_FACT_CHECK_ENABLED || "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

const FACT_CHECK_INSTRUCTIONS = `Ты юридический ревизор ответа. Тебе дают черновик ответа ассистента и фрагменты контекста, которые реально попали в промпт (ГАРАНТ, веб-поиск Яндекс/Google, документы воркспейса из RAG и вложения).

Задача: приведи черновик к фактической согласованности с контекстом. Правила:

1) Приоритет норм и юридических формулировок — у блоков из ГАРАНТ (консультантПлюс). Если в контексте есть выдержки ГАРАНТ, юридические утверждения должны им соответствовать; веб и «общие знания» не могут их опровергать. При конфликте веб/ГАРАНТ — держись ГАРАНТ или убери спорное.

2) Не добавляй новых фактов: статьи кодексов, номера постановлений, даты вступления, конкретные суммы штрафов, сроки, если их нет ни в черновике как прямая опора на приведённый в контексте фрагмент, ни в контексте. Выдуманные «точные» нормы удали или замени на осторожную формулировку о необходимости проверить по актуальным материалам ГАРАНТ и официальным источникам.

3) Числа, даты и цитаты из документов воркспейса не искажай; если черновик противоречит фрагменту файла — исправь по тексту фрагмента.

4) Галлюцинации запрещены: не подтверждай и не «достраивай» нормы, цитаты, номера актов и цифры, которых нет в контексте или в черновике как прямая опора на контекст.

5) Пункты и структура нормы: если в контексте (особенно ГАРАНТ) для обсуждаемого тезиса явно указаны статья, часть, пункт, подпункт или абзац, а черновик ссылается на норму без этой конкретики — вставь точную отсылку из контекста в текст фразы (не только ссылку в markdown). Не удаляй из черновика уже верные статья/часть/пункт. Не добавляй номеров, которых нет во фрагментах контекста. Если черновик ссылается на пункт ФСО (федеральный стандарт оценки) или иной подзаконный акт с номером пункта, а во фрагментах этого номера нет — убери ложную конкретику или замени на осторожную формулировку.

6) Сохрани структуру: заголовки, списки, таблицы markdown, ссылки. Не пиши предисловий («вот исправленный текст»). Верни только итоговый текст ответа пользователю.

7) Не сокращай ответ до одного вида источников: если в черновике сочетаются нормы/ФСО и судебная практика и это согласовано с контекстом — сохрани оба слоя; не оставляй только практику за счёт удаления корректных нормативных абзацев.`;

/**
 * @returns {boolean} true — пропустить проверку фактов
 */
function isYandexFactCheckSkipped() {
  const dis = (process.env.YANDEX_FACT_CHECK_DISABLED || "").trim().toLowerCase();
  if (dis === "true" || dis === "1" || dis === "yes" || dis === "on") {
    return true;
  }
  const en = (process.env.YANDEX_FACT_CHECK_ENABLED || "").trim().toLowerCase();
  if (en === "false" || en === "0" || en === "no" || en === "off") {
    return true;
  }
  return false;
}

/**
 * @param {Record<string, unknown>} payload
 */
function logFactCheckEvent(payload) {
  console.log(JSON.stringify({ event: "yandex_fact_check", ...payload }));
}

/**
 * Текст одного элемента contextTexts (как в промпте).
 * @param {unknown} item
 * @returns {string}
 */
function chunkPlainText(item) {
  if (typeof item === "string") return item;
  if (
    item &&
    typeof item === "object" &&
    "text" in item &&
    typeof item.text === "string"
  ) {
    return item.text;
  }
  try {
    return JSON.stringify(item);
  } catch {
    return "";
  }
}

/**
 * Фрагмент из обогащения ГАРАНТ помечается префиксом [ГАРАНТ…] (см. server/utils/garant/enrich.js).
 * @param {string} s
 */
function isGarantContextChunk(s) {
  return /^\[ГАРАНТ/.test((s || "").trim());
}

/**
 * @param {unknown} item
 * @param {number} index
 * @returns {string}
 */
function normalizeContextChunk(item, index) {
  if (typeof item === "string") {
    return `--- фрагмент ${index + 1} ---\n${item}`;
  }
  if (
    item &&
    typeof item === "object" &&
    "text" in item &&
    typeof item.text === "string"
  ) {
    return `--- фрагмент ${index + 1} ---\n${item.text}`;
  }
  try {
    return `--- фрагмент ${index + 1} ---\n${JSON.stringify(item)}`;
  } catch {
    return `--- фрагмент ${index + 1} ---\n`;
  }
}

/**
 * @param {unknown[]} contextTexts
 * @param {number} maxChars
 * @returns {{ bundle: string, garantChunksInPrompt: number, garantChunksInBundle: number, chunksInBundle: number, contextChunksTotal: number }}
 */
function buildFactCheckContextBundle(contextTexts, maxChars) {
  const emptyPlaceholder =
    "(В запрос не попали фрагменты контекста RAG/ГАРАНТ/веб. Не дополняй ответ вымышленными нормами и цифрами; убери ложную конкретику или укажи на необходимость проверки по базе ГАРАНТ.)";

  if (!Array.isArray(contextTexts) || contextTexts.length === 0) {
    return {
      bundle: emptyPlaceholder,
      garantChunksInPrompt: 0,
      garantChunksInBundle: 0,
      chunksInBundle: 0,
      contextChunksTotal: 0,
    };
  }

  let garantChunksInPrompt = 0;
  for (const item of contextTexts) {
    if (isGarantContextChunk(chunkPlainText(item))) garantChunksInPrompt++;
  }

  const parts = [];
  let used = 0;
  let garantChunksInBundle = 0;
  let chunksInBundle = 0;
  for (let i = 0; i < contextTexts.length && used < maxChars; i++) {
    const raw = normalizeContextChunk(contextTexts[i], i);
    const room = maxChars - used - 2;
    if (room < 200) break;
    const slice =
      raw.length <= room ? raw : `${raw.slice(0, room)}\n...[обрезано]`;
    parts.push(slice);
    used += slice.length + 2;
    chunksInBundle++;
    if (isGarantContextChunk(chunkPlainText(contextTexts[i]))) {
      garantChunksInBundle++;
    }
  }

  return {
    bundle: parts.join("\n\n"),
    garantChunksInPrompt,
    garantChunksInBundle,
    chunksInBundle,
    contextChunksTotal: contextTexts.length,
  };
}

/**
 * @param {string} draftText
 * @param {unknown[]} [contextTexts]
 * @returns {Promise<string>}
 */
async function applyYandexFactCheck(draftText, contextTexts = []) {
  const garantTokenConfigured = !!(process.env.GARANT_TOKEN || "").trim();

  if (!YANDEX_FACT_CHECK_ENABLED_IN_CODE && !isYandexFactCheckForcedOnByEnv()) {
    logFactCheckEvent({
      phase: "skip",
      reason: "disabled_in_code",
      judgeLlm: "yandex",
      garantTokenConfigured,
      messageRu:
        "Проверка фактов (LLM-судья Yandex) отключена в коде. Включите YANDEX_FACT_CHECK_ENABLED=true в окружении при необходимости.",
    });
    return draftText || "";
  }

  if (isYandexFactCheckSkipped()) {
    logFactCheckEvent({
      phase: "skip",
      reason: "disabled_by_env",
      judgeLlm: "yandex",
      garantTokenConfigured,
      messageRu:
        "Проверка фактов (LLM-судья Yandex) пропущена: отключена переменными окружения (YANDEX_FACT_CHECK_DISABLED или YANDEX_FACT_CHECK_ENABLED).",
    });
    return draftText || "";
  }
  const text = (draftText || "").trim();
  if (text.length < 8) {
    logFactCheckEvent({
      phase: "skip",
      reason: "draft_too_short",
      judgeLlm: "yandex",
      garantTokenConfigured,
      messageRu:
        "Проверка фактов (LLM-судья Yandex) пропущена: слишком короткий черновик ответа.",
    });
    return draftText || "";
  }

  const apiKey = yandexApiKeyForPolish();
  const folder = yandexFolderForPolish();
  if (!apiKey || !folder) {
    logFactCheckEvent({
      phase: "skip",
      reason: "no_yandex_credentials",
      judgeLlm: "yandex",
      garantTokenConfigured,
      messageRu:
        "Проверка фактов (LLM-судья Yandex) пропущена: нет API-ключа или каталога Yandex Cloud (как для Alice).",
    });
    return draftText || "";
  }

  const modelName = (
    process.env.YANDEX_FACT_CHECK_MODEL || DEFAULT_FACT_CHECK_MODEL
  ).trim();
  const modelUri = `gpt://${folder}/${modelName}`;
  const parsedMax = parseInt(
    process.env.YANDEX_FACT_CHECK_MAX_CONTEXT_CHARS || "",
    10
  );
  const maxContextChars = Math.max(
    4000,
    Math.min(
      48000,
      Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 28000
    )
  );
  const {
    bundle: contextBundle,
    garantChunksInPrompt,
    garantChunksInBundle,
    chunksInBundle,
    contextChunksTotal,
  } = buildFactCheckContextBundle(contextTexts, maxContextChars);

  const garantInBundle = garantChunksInBundle > 0;
  const input = `### Черновик ответа ассистента\n\n${text}\n\n### Фрагменты контекста для сверки (приоритет — ГАРАНТ)\n\n${contextBundle}`;

  logFactCheckEvent({
    phase: "start",
    judgeLlm: "yandex",
    model: modelName,
    folderId: folder,
    garantTokenConfigured,
    contextChunksTotal,
    garantChunksInPrompt,
    garantChunksInBundle,
    chunksSentToJudge: chunksInBundle,
    garantInBundle,
    contextBundleChars: contextBundle.length,
    draftChars: text.length,
    messageRu: garantInBundle
      ? `Запуск LLM-судьи Yandex: проверка фактов по черновику; в промпт чата было фрагментов ${contextChunksTotal}, из них ГАРАНТ: ${garantChunksInPrompt}; в пакет для судьи попало фрагментов: ${chunksInBundle}, из них ГАРАНТ: ${garantChunksInBundle} (сверка с выдержками ГАРАНТ активна).`
      : `Запуск LLM-судьи Yandex: проверка фактов по черновику; в промпт чата фрагментов: ${contextChunksTotal}, фрагментов ГАРАНТ: ${garantChunksInPrompt}; в пакет для судьи фрагментов ГАРАНТ: 0 — сверка идёт без блоков ГАРАНТ (только RAG/веб или пустой контекст). Токен GARANT_TOKEN в окружении: ${garantTokenConfigured ? "задан" : "не задан"}.`,
  });
  console.log(
    `[yandexFactCheck] Судья Yandex: старт | фрагментовВПромпте=${contextChunksTotal} гарантВПромпте=${garantChunksInPrompt} гарантВПакетеСудьи=${garantChunksInBundle} garantToken=${garantTokenConfigured ? "да" : "нет"}`
  );

  const maxOut = Math.min(
    16_000,
    Math.max(1024, Math.ceil(text.length * 1.2) + 2048)
  );
  const maxChatTokens = Math.min(
    32_000,
    Math.max(2048, Math.ceil(text.length * 1.2) + 4096)
  );

  const t0 = Date.now();
  let res = await fetch(yandexResponsesUrl(), {
    method: "POST",
    headers: {
      Authorization: "Api-Key " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelUri,
      instructions: FACT_CHECK_INSTRUCTIONS,
      input,
      temperature: 0.1,
      max_output_tokens: maxOut,
    }),
  });

  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    const fromResp = extractAssistantTextFromYandexResponse(data);
    if (fromResp.length > 0) {
      logFactCheckEvent({
        phase: "success",
        api: "responses",
        folderId: folder,
        model: modelName,
        ms: Date.now() - t0,
        inLen: text.length,
        outLen: fromResp.length,
        judgeLlm: "yandex",
        garantTokenConfigured,
        garantChunksInPrompt,
        garantChunksInBundle,
        garantInBundle,
        messageRu: garantInBundle
          ? `LLM-судья Yandex успешно проверил ответ (API responses); в сверке участвовали фрагменты ГАРАНТ (${garantChunksInBundle} шт. в пакете судьи).`
          : `LLM-судья Yandex успешно проверил ответ (API responses); фрагментов ГАРАНТ в пакете судьи не было — проверка без выдержек ГАРАНТ.`,
      });
      console.log(
        `[yandexFactCheck] Судья Yandex: успех responses | ${Date.now() - t0}ms | гарантВПакете=${garantInBundle ? "да" : "нет"} (${garantChunksInBundle})`
      );
      return fromResp;
    }
    logFactCheckEvent({
      phase: "fallback",
      api: "responses_empty",
      model: modelName,
      judgeLlm: "yandex",
      garantInBundle,
      garantChunksInBundle,
      messageRu:
        "LLM-судья Yandex: пустой ответ API responses, повтор через chat/completions (контекст ГАРАНТ в запросе без изменений).",
    });
    console.warn(
      "[yandexFactCheck] Yandex responses OK but empty output, trying chat/completions"
    );
  } else {
    const errBody = await res.text().catch(() => "");
    console.warn(
      "[yandexFactCheck] Yandex responses HTTP",
      res.status,
      errBody.slice(0, 400)
    );
    logFactCheckEvent({
      phase: "error",
      api: "responses",
      httpStatus: res.status,
      model: modelName,
      judgeLlm: "yandex",
      garantTokenConfigured,
      garantInBundle,
      garantChunksInBundle,
      messageRu: `LLM-судья Yandex: ошибка API responses HTTP ${res.status}; пробуем chat/completions.`,
    });
  }

  res = await fetch(yandexChatCompletionsUrl(), {
    method: "POST",
    headers: {
      Authorization: "Api-Key " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelUri,
      temperature: 0.1,
      max_tokens: maxChatTokens,
      messages: [
        { role: "system", content: FACT_CHECK_INSTRUCTIONS },
        { role: "user", content: input },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.warn(
      "[yandexFactCheck] Yandex chat/completions HTTP",
      res.status,
      errBody.slice(0, 400)
    );
    logFactCheckEvent({
      phase: "error",
      api: "chat_completions",
      httpStatus: res.status,
      model: modelName,
      judgeLlm: "yandex",
      garantTokenConfigured,
      garantInBundle,
      garantChunksInBundle,
      messageRu: `LLM-судья Yandex: ошибка HTTP ${res.status} (chat/completions); черновик не изменён.`,
    });
    return draftText || "";
  }

  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content;
  if (!out || typeof out !== "string" || !out.trim()) {
    logFactCheckEvent({
      phase: "done",
      api: "chat_completions",
      outcome: "empty",
      model: modelName,
      judgeLlm: "yandex",
      garantInBundle,
      garantChunksInBundle,
      messageRu:
        "LLM-судья Yandex: пустой ответ (chat/completions); черновик не изменён.",
    });
    return draftText || "";
  }
  const trimmed = out.trim();
  logFactCheckEvent({
    phase: "success",
    api: "chat_completions",
    folderId: folder,
    model: modelName,
    ms: Date.now() - t0,
    inLen: text.length,
    outLen: trimmed.length,
    judgeLlm: "yandex",
    garantTokenConfigured,
    garantChunksInPrompt,
    garantChunksInBundle,
    garantInBundle,
    messageRu: garantInBundle
      ? `LLM-судья Yandex успешно проверил ответ (chat/completions); в сверке участвовали фрагменты ГАРАНТ (${garantChunksInBundle} шт. в пакете судьи).`
      : `LLM-судья Yandex успешно проверил ответ (chat/completions); фрагментов ГАРАНТ в пакете судьи не было.`,
  });
  console.log(
    `[yandexFactCheck] Судья Yandex: успех chat/completions | гарантВПакете=${garantInBundle ? "да" : "нет"} (${garantChunksInBundle})`
  );
  return trimmed;
}

module.exports = {
  applyYandexFactCheck,
  DEFAULT_FACT_CHECK_MODEL,
  YANDEX_FACT_CHECK_ENABLED_IN_CODE,
};
