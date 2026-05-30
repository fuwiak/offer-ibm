/**
 * Вторая линия проверки фактов через OpenRouter: только выдержки ГАРАНТ в промпте.
 * Модели по умолчанию — DeepSeek и GPT-OSS 120B по очереди; убирают вымышленные п./ст./ФСО.
 * Нужны OPENROUTER_API_KEY и GARANT_TOKEN; без фрагментов [ГАРАНТ…] в контексте шаг пропускается.
 *
 * «Второй судья» в коде выключен по умолчанию (см. OPENROUTER_GARANT_FACT_CHECK_ENABLED).
 */
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** false — шаг OpenRouter по ГАРАНТ не вызывается (первый судья Yandex fact check остаётся). */
const OPENROUTER_GARANT_FACT_CHECK_ENABLED = false;

const DEFAULT_MODELS = [
  "deepseek/deepseek-v3.2-speciale",
  "openai/gpt-oss-120b",
];

const SYSTEM_PROMPT = `Ты контролёр юридических ссылок. Единственный допустимый источник норм и точных реквизитов (статьи, части, пункты, подпункты, абзацы, номера пунктов федеральных стандартов оценки ФСО и т.п.) — текст ниже в блоке «Выдержки ГАРАНТ». Вне этого текста для проверки конкретных номеров норм ничего не существует.

Если в черновике указаны «п. N», «ст. N», «ФСО … п. N» или иная конкретика, которой нет дословно или однозначно не следует из выдержек ГАРАНТ — убери ложную конкретику: замени на осторожную формулировку (например, сверка с актуальной карточкой в ГАРАНТ, в выдержках пункт не приведён) или изложи смысл без вымышленного номера.

Если в выдержках ГАРАНТ для соответствующего акта или темы явно указаны статья, часть, пункт, подпункт или пункт ФСО, а черновик ссылается на тот же акт только общим названием («Федеральный закон…», «в соответствии с 135-ФЗ») без этой конкретики — дополни текст отсылки в деловой форме внутри фразы (например: «в нарушение п. … ст. …», «согласно ч. … ст. …»), используя только то, что есть в выдержках. Не ограничивайся одной markdown-ссылкой на карточку без словесного указания структурной единицы нормы, если она есть в выдержках.

Сохраняй полноту черновика: нормативные блоки, ФСО, судебную практику, выводы и разделы. Запрещено «сужать» ответ до одного типа источников (например, оставить только суды и выбросить корректные отсылки к законам), если в черновике они не противоречат выдержкам.

Запрещено придумывать новые статьи, пункты и цитаты. Не пересказывай нормы, которых нет в выдержках. Сохрани структуру ответа (markdown, списки, таблицы, ссылки), если они не содержат ложных номеров норм.

Верни только полный исправленный текст ответа пользователю, без предисловий.`;

/**
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
 * @param {string} s
 */
function isGarantContextChunk(s) {
  return /^\[ГАРАНТ/.test((s || "").trim());
}

/**
 * Только фрагменты ГАРАНТ из contextTexts (порядок сохраняется).
 * @param {unknown[]} contextTexts
 * @param {number} maxChars
 * @returns {{ bundle: string, garantChunks: number }}
 */
function buildGarantOnlyBundle(contextTexts, maxChars) {
  if (!Array.isArray(contextTexts) || contextTexts.length === 0) {
    return { bundle: "", garantChunks: 0 };
  }
  const garantItems = contextTexts.filter((item) =>
    isGarantContextChunk(chunkPlainText(item))
  );
  const parts = [];
  let used = 0;
  for (let i = 0; i < garantItems.length && used < maxChars; i++) {
    const body = chunkPlainText(garantItems[i]);
    const header = `--- ГАРАНТ ${i + 1} ---\n`;
    const raw = header + body;
    const room = maxChars - used - 2;
    if (room < 120) break;
    const slice =
      raw.length <= room ? raw : `${raw.slice(0, room)}\n...[обрезано]`;
    parts.push(slice);
    used += slice.length + 2;
  }
  return {
    bundle: parts.join("\n\n"),
    garantChunks: garantItems.length,
  };
}

/**
 * @param {Record<string, unknown>} payload
 */
function logEvent(payload) {
  console.log(JSON.stringify({ event: "openrouter_garant_fact_check", ...payload }));
}

function openRouterApiKey() {
  return (process.env.OPENROUTER_API_KEY || "").trim();
}

function factCheckModels() {
  const raw = (process.env.OPENROUTER_FACT_CHECK_MODELS || "").trim();
  if (raw) {
    return raw
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
  }
  return [...DEFAULT_MODELS];
}

function isSkippedByEnv() {
  const dis = (process.env.OPENROUTER_FACT_CHECK_DISABLED || "").trim().toLowerCase();
  if (dis === "true" || dis === "1" || dis === "yes" || dis === "on") return true;
  const en = (process.env.OPENROUTER_FACT_CHECK_ENABLED || "").trim().toLowerCase();
  if (en === "false" || en === "0" || en === "no" || en === "off") return true;
  return false;
}

/**
 * @param {string} draftText
 * @param {string} garantBundle
 * @param {string} model
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
async function callOpenRouterOnce(draftText, garantBundle, model, apiKey) {
  const maxTokens = Math.min(
    32_000,
    Math.max(2048, Math.ceil(draftText.length * 1.2) + 4096)
  );
  const userContent = `### Выдержки ГАРАНТ (единственная опора для номеров норм и пунктов)\n\n${garantBundle}\n\n### Черновик ответа\n\n${draftText}`;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.OPENROUTER_FACT_CHECK_REFERER ||
        process.env.RUSSIAN_STYLE_POLISH_REFERER ||
        "https://anythingllm.com",
      "X-Title": "AnythingLLM Garant fact check",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    logEvent({
      phase: "error",
      model,
      httpStatus: res.status,
      messageRu: `OpenRouter (проверка по ГАРАНТ): HTTP ${res.status}; текст не изменён на этом шаге.`,
    });
    console.warn(
      "[openRouterGarantFactCheck] HTTP",
      res.status,
      errBody.slice(0, 400)
    );
    return draftText;
  }

  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content;
  if (!out || typeof out !== "string" || !out.trim()) {
    logEvent({
      phase: "done",
      model,
      outcome: "empty",
      messageRu:
        "OpenRouter (проверка по ГАРАНТ): пустой ответ; текст не изменён на этом шаге.",
    });
    return draftText;
  }
  return out.trim();
}

/**
 * @param {string} draftText
 * @param {unknown[]} [contextTexts]
 * @returns {Promise<string>}
 */
async function applyOpenRouterGarantFactCheck(draftText, contextTexts = []) {
  if (!OPENROUTER_GARANT_FACT_CHECK_ENABLED) {
    logEvent({
      phase: "skip",
      reason: "disabled_in_code",
      messageRu:
        "Проверка OpenRouter по ГАРАНТ отключена в коде (OPENROUTER_GARANT_FACT_CHECK_ENABLED=false).",
    });
    return draftText || "";
  }
  if (isSkippedByEnv()) {
    return draftText || "";
  }
  const text = (draftText || "").trim();
  if (text.length < 8) return draftText || "";

  const apiKey = openRouterApiKey();
  if (!apiKey) {
    logEvent({
      phase: "skip",
      reason: "no_openrouter_api_key",
      messageRu:
        "Проверка OpenRouter по ГАРАНТ пропущена: нет OPENROUTER_API_KEY.",
    });
    return draftText || "";
  }

  if (!(process.env.GARANT_TOKEN || "").trim()) {
    logEvent({
      phase: "skip",
      reason: "no_garant_token",
      messageRu:
        "Проверка OpenRouter по ГАРАНТ пропущена: не задан GARANT_TOKEN.",
    });
    return draftText || "";
  }

  const parsedMax = parseInt(
    process.env.OPENROUTER_FACT_CHECK_MAX_GARANT_CHARS || "",
    10
  );
  const maxGarantChars = Math.max(
    2000,
    Math.min(
      48000,
      Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 28000
    )
  );

  const { bundle: garantBundle, garantChunks } = buildGarantOnlyBundle(
    contextTexts,
    maxGarantChars
  );

  if (!garantBundle || garantChunks < 1) {
    logEvent({
      phase: "skip",
      reason: "no_garant_chunks_in_context",
      garantChunks,
      messageRu:
        "Проверка OpenRouter по ГАРАНТ пропущена: в контексте запроса нет фрагментов [ГАРАНТ…].",
    });
    return draftText || "";
  }

  const models = factCheckModels();
  if (models.length === 0) {
    return draftText || "";
  }

  logEvent({
    phase: "start",
    models,
    garantChunks,
    garantBundleChars: garantBundle.length,
    draftChars: text.length,
    messageRu: `Запуск цепочки OpenRouter по ГАРАНТ: моделей ${models.length}, фрагментов ГАРАНТ в сверке: ${garantChunks}.`,
  });
  console.log(
    `[openRouterGarantFactCheck] старт | модели=${models.join(" → ")} | фрагментовГАРАНТ=${garantChunks}`
  );

  let current = text;
  const t0 = Date.now();
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const stepStart = Date.now();
    const next = await callOpenRouterOnce(current, garantBundle, model, apiKey);
    const changed = next !== current;
    current = next;
    logEvent({
      phase: "step_done",
      stepIndex: i + 1,
      model,
      ms: Date.now() - stepStart,
      changed,
      outLen: current.length,
      messageRu: changed
        ? `OpenRouter (${model}): черновик скорректирован по выдержкам ГАРАНТ.`
        : `OpenRouter (${model}): ответ без изменений на этом шаге.`,
    });
    console.log(
      `[openRouterGarantFactCheck] шаг ${i + 1}/${models.length} ${model} | ${Date.now() - stepStart}ms | changed=${changed}`
    );
  }

  logEvent({
    phase: "success",
    models,
    msTotal: Date.now() - t0,
    garantChunks,
    messageRu:
      "Цепочка OpenRouter (проверка строго по ГАРАНТ) завершена.",
  });

  return current;
}

module.exports = {
  applyOpenRouterGarantFactCheck,
  DEFAULT_MODELS,
};
