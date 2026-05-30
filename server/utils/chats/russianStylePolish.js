"use strict";

/**
 * Редактор — полировка русского юридического стиля.
 *
 * Приоритет провайдеров:
 *   1. Yandex Alice (Yandex Cloud) — /v1/responses → /v1/chat/completions
 *   2. OpenRouter — любая модель из RUSSIAN_STYLE_POLISH_MODEL
 *
 * Отключение: RUSSIAN_STYLE_POLISH_DISABLED=true
 *
 * Внешние HTTP API:
 *   Yandex (основной):  POST {YANDEX_CLOUD_AI_BASE_URL}/responses
 *                       Authorization: Api-Key <YANDEX_CLOUD_API_KEY>
 *   Yandex (резерв):    POST {YANDEX_CLOUD_AI_BASE_URL}/chat/completions
 *   OpenRouter:         POST https://openrouter.ai/api/v1/chat/completions
 *                       Authorization: Bearer <OPENROUTER_API_KEY>
 *
 * Переменные окружения:
 *   RUSSIAN_STYLE_POLISH_DISABLED   — выключить (default: нет)
 *   YANDEX_CLOUD_API_KEY            — ключ Yandex Cloud (Alice)
 *   YANDEX_CLOUD_FOLDER / YANDEX_FOLDER_ID — каталог Yandex
 *   YANDEX_CLOUD_MODEL              — модель Alice (default: yandexgpt-5.1/latest)
 *   YANDEX_CLOUD_AI_BASE_URL        — base URL Yandex (default: https://ai.api.cloud.yandex.net/v1)
 *   OPENROUTER_API_KEY              — ключ OpenRouter (fallback)
 *   RUSSIAN_STYLE_POLISH_MODEL      — модель OpenRouter (default: deepseek/deepseek-v3)
 */

const DEFAULT_YANDEX_MODEL = "yandexgpt-5.1/latest";
const DEFAULT_YANDEX_BASE_URL = "https://ai.api.cloud.yandex.net/v1";
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v3";

// ─── Промпт редактора ──────────────────────────────────────────────────────────

const POLISH_SYSTEM_PROMPT = `Ты редактор юридических текстов. Твоя задача — улучшить стиль и читаемость ответа, не меняя его содержательную часть.
Правила:
1. Устраняй канцелярит, неоправданные повторения, двусмысленности.
2. Сохраняй все юридические термины, ссылки на законы, цифры и факты без изменений.
3. Сохраняй структуру (заголовки, списки, абзацы) как есть.
4. Язык — русский. Стиль — деловой, чёткий, без излишней формальности.
5. Верни только отредактированный текст — без комментариев.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function yandexApiKeyForPolish() {
  return (
    (process.env.YANDEX_CLOUD_API_KEY || "").trim() ||
    (process.env.YANDEX_SEARCH_API_KEY || "").trim()
  );
}

function yandexFolderForPolish() {
  return (
    (process.env.YANDEX_CLOUD_FOLDER || "").trim() ||
    (process.env.YANDEX_FOLDER_ID || "").trim()
  );
}

function yandexBaseUrl() {
  return (process.env.YANDEX_CLOUD_AI_BASE_URL || DEFAULT_YANDEX_BASE_URL).replace(/\/$/, "");
}

function yandexModelUri() {
  const folder = yandexFolderForPolish();
  const model = (process.env.YANDEX_CLOUD_MODEL || DEFAULT_YANDEX_MODEL).trim();
  return folder ? `gpt://${folder}/${model}` : model;
}

function openRouterKey() {
  return (process.env.OPENROUTER_API_KEY || "").trim();
}

function openRouterBaseUrl() {
  return (process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL).replace(/\/$/, "");
}

function openRouterModel() {
  return (process.env.RUSSIAN_STYLE_POLISH_MODEL || DEFAULT_OPENROUTER_MODEL).trim();
}

function isPolishDisabled() {
  return ["1", "true", "yes"].includes(
    (process.env.RUSSIAN_STYLE_POLISH_DISABLED || "").toLowerCase()
  );
}

function logPolishEvent(data) {
  console.log(`\x1b[33m[RussianStylePolish]\x1b[0m`, JSON.stringify(data));
}

/**
 * Extracts text from Yandex Cloud API responses (responses OR chat/completions format).
 * @param {unknown} data
 * @returns {string}
 */
function extractAssistantTextFromYandexResponse(data) {
  // responses API output format
  if (data?.output) {
    const out = Array.isArray(data.output) ? data.output : [data.output];
    for (const item of out) {
      if (item?.type === "message" && Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (c?.type === "output_text" && typeof c?.text === "string") return c.text;
        }
      }
      if (typeof item?.text === "string") return item.text;
    }
  }
  // chat/completions format
  const choice = data?.choices?.[0];
  return choice?.message?.content || choice?.delta?.content || "";
}

// ─── Yandex Cloud polishing ────────────────────────────────────────────────────

/**
 * Полирует текст через Yandex Cloud (Alice).
 * Пробует /responses, при ошибке — /chat/completions.
 *
 * @returns {{ text: string, aliceLlmOk: boolean }}
 */
async function polishWithYandexCloud(text, apiKey, folder) {
  const uri = yandexModelUri();
  const maxOut = Math.max(512, Math.min(8192, Math.ceil(text.length * 1.15)));
  const t0 = Date.now();

  const responsesUrl = `${yandexBaseUrl()}/responses`;
  const chatUrl = `${yandexBaseUrl()}/chat/completions`;

  async function tryResponses() {
    const res = await fetch(responsesUrl, {
      method: "POST",
      headers: {
        Authorization: "Api-Key " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: uri,
        instructions: POLISH_SYSTEM_PROMPT,
        input: text,
        temperature: 0.2,
        max_output_tokens: maxOut,
      }),
    });
    if (!res.ok) throw new Error(`Yandex responses ${res.status}: ${await res.text().catch(() => "")}`);
    return res.json();
  }

  async function tryChat() {
    const res = await fetch(chatUrl, {
      method: "POST",
      headers: {
        Authorization: "Api-Key " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: uri,
        messages: [
          { role: "system", content: POLISH_SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        temperature: 0.2,
        max_tokens: maxOut,
      }),
    });
    if (!res.ok) throw new Error(`Yandex chat ${res.status}: ${await res.text().catch(() => "")}`);
    return res.json();
  }

  let data;
  let aliceLlmOk = false;
  try {
    data = await tryResponses();
    aliceLlmOk = true;
  } catch (e) {
    logPolishEvent({ phase: "yandex_responses_failed", error: e.message, fallback: "chat/completions" });
    try {
      data = await tryChat();
      aliceLlmOk = true;
    } catch (e2) {
      logPolishEvent({ phase: "yandex_chat_failed", error: e2.message });
      return { text, aliceLlmOk: false };
    }
  }

  const result = extractAssistantTextFromYandexResponse(data);
  if (!result || result.trim().length < 5) {
    logPolishEvent({ phase: "yandex_empty_response", ms: Date.now() - t0 });
    return { text, aliceLlmOk };
  }

  logPolishEvent({ phase: "yandex_done", ms: Date.now() - t0, inLen: text.length, outLen: result.length });
  return { text: result, aliceLlmOk };
}

// ─── OpenRouter polishing ──────────────────────────────────────────────────────

async function polishWithOpenRouter(text, apiKey) {
  const model = openRouterModel();
  const maxOut = Math.max(512, Math.min(8192, Math.ceil(text.length * 1.15)));
  const t0 = Date.now();

  const res = await fetch(`${openRouterBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://lawyer-revizorro.ru",
      "X-Title": "LegalRAG StylePolish",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: POLISH_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      temperature: 0.2,
      max_tokens: maxOut,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${model} ${res.status}: ${err}`);
  }
  const data = await res.json();
  const result = data?.choices?.[0]?.message?.content;
  if (!result || typeof result !== "string" || result.trim().length < 5) {
    return text;
  }

  logPolishEvent({ phase: "openrouter_done", model, ms: Date.now() - t0, inLen: text.length, outLen: result.length });
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Полирует русскоязычный юридический текст.
 * Пробует Yandex Alice, при недоступности — OpenRouter.
 *
 * @param {string} text
 * @returns {Promise<string>}
 */
async function applyRussianStylePolish(text) {
  if (!text || typeof text !== "string" || text.trim().length < 3) {
    logPolishEvent({ phase: "skip", reason: "text_too_short" });
    return text;
  }
  if (isPolishDisabled()) {
    logPolishEvent({ phase: "skip", reason: "RUSSIAN_STYLE_POLISH_DISABLED" });
    return text;
  }

  const yandexKey = yandexApiKeyForPolish();
  const folder    = yandexFolderForPolish();

  // ── 1. Yandex Alice ──────────────────────────────────────────────────────────
  if (yandexKey && folder) {
    logPolishEvent({ phase: "yandex_start", model: yandexModelUri() });
    const { text: out, aliceLlmOk } = await polishWithYandexCloud(text, yandexKey, folder);
    if (aliceLlmOk) return out;
    logPolishEvent({ phase: "yandex_unavailable_trying_openrouter" });
  }

  // ── 2. OpenRouter fallback ───────────────────────────────────────────────────
  const orKey = openRouterKey();
  if (!orKey) {
    logPolishEvent({ phase: "skip", reason: "no_yandex_and_no_openrouter_key" });
    return text;
  }

  logPolishEvent({ phase: "openrouter_start", model: openRouterModel() });
  try {
    return await polishWithOpenRouter(text, orKey);
  } catch (e) {
    logPolishEvent({ phase: "openrouter_error", error: e.message });
    return text;
  }
}

module.exports = {
  applyRussianStylePolish,
  extractAssistantTextFromYandexResponse,
  POLISH_SYSTEM_PROMPT,
};
