/**
 * Постобработка ответа ассистента: естественный русский.
 * При наличии Yandex Cloud (Alice) — через ai.api.cloud.yandex.net (переменные Railway).
 * Иначе при OPENROUTER_API_KEY — OpenRouter (модель RUSSIAN_STYLE_POLISH_MODEL).
 *
 * Ключ: YANDEX_CLOUD_API_KEY или тот же, что для Search API — YANDEX_SEARCH_API_KEY.
 */
const DEFAULT_YANDEX_MODEL = "aliceai-llm/latest";
const OPENROUTER_DEFAULT_MODEL = "deepseek/deepseek-v3.2-speciale";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `Ты редактор юридических и деловых текстов на русском языке. Перепиши ответ ассистента на естественный, грамотный русский: нейтрально-деловой стиль, без кальки с английского, без лишней канцеляриты там, где это уместно. Сохрани смысл, факты, нумерацию, структуру (заголовки, списки, markdown-таблицы, ссылки в markdown). Ссылки на нормы права (статья, часть, пункт, подпункт, наименование акта) не обобщай и не опускай: если они указаны в тексте, оставь их явными; при необходимости встрой реквизиты нормы в фразу («в нарушение ст. …», «согласно п. … ч. …»), не заменяя их одной общей отсылкой к закону. Не выбрасывай целые разделы (нормы, ФСО, судебная практика), не сокращай текст до одного типа источников. Не добавляй новых фактов, источников и рассуждений. Если текст уже на хорошем русском, верни его с минимальными правками. Верни только исправленный текст, без вступлений вроде «Вот исправленный вариант».`;

/** Явные сообщения в логах Railway: Alice LLM реально отработала. */
const ALICE_LLM_OK_RESPONSES_RU =
  "Alice LLM (Yandex Cloud) успешно использована для постобработки ответа через API /v1/responses.";
const ALICE_LLM_OK_CHAT_COMPLETIONS_RU =
  "Alice LLM (Yandex Cloud) успешно использована для постобработки ответа через API /v1/chat/completions (резервный режим).";

/**
 * Структурный лог для Railway (фильтр по event или [russianStylePolish]).
 * @param {Record<string, unknown>} payload
 */
function logPolishEvent(payload) {
  console.log(JSON.stringify({ event: "russian_style_polish", ...payload }));
}

/**
 * Каталог для polish: явный YANDEX_CLOUD_FOLDER или те же алиасы, что у Search API.
 * @returns {string}
 */
function yandexFolderForPolish() {
  return (
    (process.env.YANDEX_CLOUD_FOLDER || "").trim() ||
    (process.env.YANDEX_SEARCH_FOLDER_ID || "").trim() ||
    (process.env.YANDEX_FOLDER_ID || "").trim()
  );
}

function yandexAiBaseUrl() {
  return (
    process.env.YANDEX_CLOUD_AI_BASE_URL || "https://ai.api.cloud.yandex.net/v1"
  ).replace(/\/$/, "");
}

/**
 * API-ключ для Alice (LLM): отдельный или общий с Search API.
 * @returns {string}
 */
function yandexApiKeyForPolish() {
  return (
    (process.env.YANDEX_CLOUD_API_KEY || "").trim() ||
    (process.env.YANDEX_SEARCH_API_KEY || "").trim()
  );
}

function yandexChatCompletionsUrl() {
  return `${yandexAiBaseUrl()}/chat/completions`;
}

function yandexResponsesUrl() {
  return `${yandexAiBaseUrl()}/responses`;
}

/**
 * Текст ответа из /v1/responses (OpenAI-совместимый формат Yandex).
 * @param {unknown} data
 * @returns {string}
 */
function extractAssistantTextFromYandexResponse(data) {
  if (!data || typeof data !== "object") return "";
  const root = data;
  if (
    "output_text" in root &&
    typeof root.output_text === "string" &&
    root.output_text.trim()
  ) {
    return root.output_text.trim();
  }
  const output = "output" in root ? root.output : null;
  if (!Array.isArray(output)) return "";
  const chunks = [];
  for (const block of output) {
    if (!block || typeof block !== "object") continue;
    const content = "content" in block ? block.content : null;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const typ = "type" in part ? part.type : null;
      const tx = "text" in part ? part.text : null;
      if (typeof tx !== "string") continue;
      if (typ === "output_text" || typ === "text") chunks.push(tx);
    }
  }
  return chunks.join("").trim();
}

/**
 * @param {string} text
 * @param {string} apiKey
 * @param {string} folder
 * @returns {Promise<{ text: string, aliceLlmOk: boolean }>}
 */
async function polishWithYandexCloud(text, apiKey, folder) {
  const modelName = (
    process.env.YANDEX_CLOUD_MODEL || DEFAULT_YANDEX_MODEL
  ).trim();
  const modelUri = `gpt://${folder}/${modelName}`;
  const maxOut = Math.min(
    16_000,
    Math.max(512, Math.ceil(text.length / 2) + 1536)
  );
  const maxChatTokens = Math.min(
    32_000,
    Math.max(1024, Math.ceil(text.length / 2) + 2048)
  );

  // 1) /v1/responses — как scripts/setup-alice.py (Alice ожидается здесь).
  let res = await fetch(yandexResponsesUrl(), {
    method: "POST",
    headers: {
      Authorization: "Api-Key " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelUri,
      instructions: SYSTEM_PROMPT,
      input: text,
      temperature: 0.25,
      max_output_tokens: maxOut,
    }),
  });

  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    const fromResp = extractAssistantTextFromYandexResponse(data);
    if (fromResp.length > 0) {
      logPolishEvent({
        phase: "success",
        provider: "yandex_alice",
        aliceLlmUsedOk: true,
        api: "responses",
        folderId: folder,
        model: modelName,
        messageRu: ALICE_LLM_OK_RESPONSES_RU,
      });
      console.log(`[russianStylePolish] ${ALICE_LLM_OK_RESPONSES_RU}`);
      return { text: fromResp, aliceLlmOk: true };
    }
    console.warn(
      "[russianStylePolish] Yandex responses OK but empty output, trying chat/completions"
    );
  } else {
    const errBody = await res.text().catch(() => "");
    console.warn(
      "[russianStylePolish] Yandex responses HTTP",
      res.status,
      errBody.slice(0, 400)
    );
  }

  // 2) Запасной путь: chat/completions
  res = await fetch(yandexChatCompletionsUrl(), {
    method: "POST",
    headers: {
      Authorization: "Api-Key " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelUri,
      temperature: 0.25,
      max_tokens: maxChatTokens,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.warn(
      "[russianStylePolish] Yandex chat/completions HTTP",
      res.status,
      errBody.slice(0, 400)
    );
    logPolishEvent({
      phase: "error",
      provider: "yandex_alice",
      api: "chat_completions",
      httpStatus: res.status,
      folderId: folder,
      model: modelName,
    });
    return { text, aliceLlmOk: false };
  }

  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content;
  if (!out || typeof out !== "string") {
    logPolishEvent({
      phase: "done",
      provider: "yandex_alice",
      api: "chat_completions",
      outcome: "empty_choices",
      folderId: folder,
      model: modelName,
    });
    return { text, aliceLlmOk: false };
  }
  const trimmed = out.trim();
  if (trimmed.length < 1) {
    logPolishEvent({
      phase: "done",
      provider: "yandex_alice",
      api: "chat_completions",
      outcome: "empty_content",
      folderId: folder,
      model: modelName,
    });
    return { text, aliceLlmOk: false };
  }
  logPolishEvent({
    phase: "success",
    provider: "yandex_alice",
    aliceLlmUsedOk: true,
    api: "chat_completions",
    folderId: folder,
    model: modelName,
    messageRu: ALICE_LLM_OK_CHAT_COMPLETIONS_RU,
  });
  console.log(`[russianStylePolish] ${ALICE_LLM_OK_CHAT_COMPLETIONS_RU}`);
  return { text: trimmed, aliceLlmOk: true };
}

/**
 * @param {string} text
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
async function polishWithOpenRouter(text, apiKey) {
  const model =
    process.env.RUSSIAN_STYLE_POLISH_MODEL || OPENROUTER_DEFAULT_MODEL;
  const maxTokens = Math.min(
    32_000,
    Math.max(1024, Math.ceil(text.length / 2) + 2048)
  );

  console.log(
    "[russianStylePolish] OpenRouter start",
    JSON.stringify({ model, inputChars: text.length, maxTokens })
  );

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.RUSSIAN_STYLE_POLISH_REFERER || "https://anythingllm.com",
      "X-Title": "AnythingLLM Russian style polish",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.warn(
      "[russianStylePolish] OpenRouter HTTP",
      res.status,
      errBody.slice(0, 400)
    );
    return text;
  }

  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content;
  if (!out || typeof out !== "string") return text;
  const trimmed = out.trim();
  if (trimmed.length < 1) return text;
  return trimmed;
}

/**
 * @param {string} text
 * @returns {Promise<string>}
 */
async function applyRussianStylePolish(text) {
  if (!text || typeof text !== "string" || text.trim().length < 3) {
    logPolishEvent({ phase: "skip", reason: "text_too_short" });
    return text;
  }
  if (process.env.RUSSIAN_STYLE_POLISH_DISABLED === "true") {
    logPolishEvent({ phase: "skip", reason: "RUSSIAN_STYLE_POLISH_DISABLED" });
    return text;
  }

  const yandexKey = yandexApiKeyForPolish();
  const folder = yandexFolderForPolish();

  try {
    if (yandexKey && folder) {
      const yModel = (
        process.env.YANDEX_CLOUD_MODEL || DEFAULT_YANDEX_MODEL
      ).trim();
      const t0 = Date.now();
      const polishKeySource = (process.env.YANDEX_CLOUD_API_KEY || "").trim()
        ? "cloud"
        : "search";
      logPolishEvent({
        phase: "start",
        provider: "yandex_alice",
        folderId: folder,
        model: yModel,
        modelUri: `gpt://${folder}/${yModel}`,
        inputChars: text.length,
        responsesUrl: yandexResponsesUrl(),
        chatUrl: yandexChatCompletionsUrl(),
        keySource: polishKeySource,
      });
      console.log(
        `[russianStylePolish] Запуск постобработки: Alice LLM (${yModel}), сначала /v1/responses, при неудаче — /v1/chat/completions`
      );
      const { text: out, aliceLlmOk } = await polishWithYandexCloud(
        text,
        yandexKey,
        folder
      );
      const ms = Date.now() - t0;
      const changed = out !== text;
      if (aliceLlmOk) {
        const summaryRu = changed
          ? "Итог: Alice LLM успешно отредактировала ответ."
          : "Итог: Alice LLM успешно вызвана; текст практически без изменений (модель не внесла существенных правок).";
        logPolishEvent({
          phase: "done",
          provider: "yandex_alice",
          aliceLlmPipelineFinished: true,
          aliceLlmUsedOk: true,
          ms,
          inputChars: text.length,
          outputChars: out.length,
          textChanged: changed,
          folderId: folder,
          model: yModel,
          messageRu: summaryRu,
        });
        console.log(
          `[russianStylePolish] ${summaryRu} Время: ${ms} мс; длина до/после: ${text.length} → ${out.length} символов.`
        );
      } else {
        const failRu =
          "Alice LLM не применена: Yandex API не вернул текст постобработки; пользователю отдан исходный ответ основной модели.";
        logPolishEvent({
          phase: "done",
          provider: "yandex_alice",
          aliceLlmPipelineFinished: true,
          aliceLlmUsedOk: false,
          ms,
          inputChars: text.length,
          outputChars: out.length,
          textChanged: false,
          folderId: folder,
          model: yModel,
          messageRu: failRu,
        });
        console.warn(`[russianStylePolish] ${failRu} (${ms} мс)`);
      }
      return out;
    }

    if (yandexKey && !folder) {
      logPolishEvent({
        phase: "skip",
        reason: "yandex_key_but_no_folder",
        hint: "set YANDEX_CLOUD_FOLDER or YANDEX_FOLDER_ID",
      });
    } else if (!yandexKey && folder) {
      logPolishEvent({
        phase: "skip",
        reason: "folder_but_no_yandex_key",
        hint: "set YANDEX_CLOUD_API_KEY or YANDEX_SEARCH_API_KEY",
      });
    }

    const orKey = process.env.OPENROUTER_API_KEY;
    if (!orKey) {
      logPolishEvent({
        phase: "skip",
        reason: "no_polish_backend",
        hasYandexKey: !!yandexKey,
        hasYandexFolder: !!folder,
        hasOpenrouterKey: false,
        hasEnvYandexCloudKey: !!(process.env.YANDEX_CLOUD_API_KEY || "").trim(),
        hasEnvYandexSearchKey: !!(
          process.env.YANDEX_SEARCH_API_KEY || ""
        ).trim(),
      });
      return text;
    }

    const t0 = Date.now();
    const orModel =
      process.env.RUSSIAN_STYLE_POLISH_MODEL || OPENROUTER_DEFAULT_MODEL;
    logPolishEvent({
      phase: "start",
      provider: "openrouter",
      model: orModel,
      inputChars: text.length,
    });
    const out = await polishWithOpenRouter(text, orKey);
    const ms = Date.now() - t0;
    const changed = out !== text;
    logPolishEvent({
      phase: "done",
      provider: "openrouter",
      ms,
      inputChars: text.length,
      outputChars: out.length,
      textChanged: changed,
      model: orModel,
    });
    console.log(
      "[russianStylePolish] OpenRouter done",
      `ms=${ms} changed=${changed} in=${text.length} out=${out.length}`
    );
    return out;
  } catch (e) {
    console.warn("[russianStylePolish]", e?.message || e);
    logPolishEvent({
      phase: "error",
      message: e?.message || String(e),
    });
    return text;
  }
}

module.exports = {
  applyRussianStylePolish,
  yandexApiKeyForPolish,
  yandexFolderForPolish,
  yandexAiBaseUrl,
  yandexResponsesUrl,
  yandexChatCompletionsUrl,
  extractAssistantTextFromYandexResponse,
  /** @deprecated имя сохранено для совместимости; это дефолт OpenRouter, если нет Yandex */
  DEFAULT_MODEL: OPENROUTER_DEFAULT_MODEL,
  DEFAULT_YANDEX_MODEL,
};
