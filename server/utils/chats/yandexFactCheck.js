"use strict";

/**
 * Судья №1 — Yandex Cloud fact-check.
 *
 * Берёт черновик ответа ассистента и полный контекст (ГАРАНТ + RAG + веб),
 * прогоняет через юридический ревизор-промпт и возвращает скорректированный текст.
 *
 * По умолчанию ВЫКЛЮЧЕН в коде (YANDEX_FACT_CHECK_ENABLED_IN_CODE = false),
 * потому что агрессивно переписывает ответ.
 * Включение: установить env YANDEX_FACT_CHECK_ENABLED=true.
 *
 * Внешний HTTP API:
 *   Основной:  POST {YANDEX_CLOUD_AI_BASE_URL}/responses
 *              Authorization: Api-Key <YANDEX_CLOUD_API_KEY или YANDEX_SEARCH_API_KEY>
 *   Резервный: POST {YANDEX_CLOUD_AI_BASE_URL}/chat/completions
 *              (те же заголовки)
 *
 * Переменные окружения:
 *   YANDEX_FACT_CHECK_ENABLED          — включить (по умолчанию off)
 *   YANDEX_FACT_CHECK_DISABLED         — принудительно выключить
 *   YANDEX_FACT_CHECK_MODEL            — модель (default: yandexgpt-5.1/latest)
 *   YANDEX_FACT_CHECK_MAX_CONTEXT_CHARS — лимит символов контекста (default: 28000)
 *   YANDEX_CLOUD_AI_BASE_URL           — base URL (default: https://ai.api.cloud.yandex.net/v1)
 *   YANDEX_CLOUD_API_KEY / YANDEX_SEARCH_API_KEY — ключ API
 *   YANDEX_CLOUD_FOLDER / YANDEX_FOLDER_ID       — идентификатор каталога
 */

// Включён ли судья в коде (независимо от env)
const YANDEX_FACT_CHECK_ENABLED_IN_CODE = false;

const DEFAULT_MODEL = "yandexgpt-5.1/latest";
const DEFAULT_MAX_CONTEXT_CHARS = 28_000;
const DEFAULT_BASE_URL = "https://ai.api.cloud.yandex.net/v1";

// ─── Системный промпт ревизора ─────────────────────────────────────────────────

const FACT_CHECK_INSTRUCTIONS = `Ты юридический ревизор ответа. Тебе дают черновик ответа ассистента и фрагменты контекста, которые реально попали в промпт (ГАРАНТ, веб-поиск Яндекс/Google, документы воркспейса из RAG и вложения).
Задача: приведи черновик к фактической согласованности с контекстом. Правила:
1) Приоритет норм и юридических формулировок — у блоков из ГАРАНТ (КонсультантПлюс). Если в контексте есть выдержки ГАРАНТ, юридические утверждения должны им соответствовать; веб и «общие знания» не могут их опровергать. При конфликте веб/ГАРАНТ — держись ГАРАНТ или убери спорное.
2) Не выдумывай ничего сверх контекста. Если данных нет — прямо укажи «в предоставленном контексте информация отсутствует», но не фантазируй.
3) Не меняй стиль и структуру без необходимости; исправляй только фактические ошибки.
4) Сохраняй язык оригинала (русский).
5) Верни только исправленный текст — без комментариев и пояснений от себя.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiKey() {
  return (
    (process.env.YANDEX_CLOUD_API_KEY || "").trim() ||
    (process.env.YANDEX_SEARCH_API_KEY || "").trim()
  );
}

function folderId() {
  return (
    (process.env.YANDEX_CLOUD_FOLDER || "").trim() ||
    (process.env.YANDEX_FOLDER_ID || "").trim()
  );
}

function baseUrl() {
  return (process.env.YANDEX_CLOUD_AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function yandexResponsesUrl() {
  return `${baseUrl()}/responses`;
}

function yandexChatUrl() {
  return `${baseUrl()}/chat/completions`;
}

function modelUri() {
  const folder = folderId();
  const model = (process.env.YANDEX_FACT_CHECK_MODEL || DEFAULT_MODEL).trim();
  if (!folder) return model;
  return `gpt://${folder}/${model}`;
}

function maxContextChars() {
  const v = parseInt(process.env.YANDEX_FACT_CHECK_MAX_CONTEXT_CHARS, 10);
  return isNaN(v) || v <= 0 ? DEFAULT_MAX_CONTEXT_CHARS : v;
}

function isEnabled() {
  if (!YANDEX_FACT_CHECK_ENABLED_IN_CODE) {
    const envOn =
      ["1", "true", "yes"].includes((process.env.YANDEX_FACT_CHECK_ENABLED || "").toLowerCase());
    if (!envOn) return false;
  }
  if (
    ["1", "true", "yes"].includes(
      (process.env.YANDEX_FACT_CHECK_DISABLED || "").toLowerCase()
    )
  )
    return false;
  return !!(apiKey() && folderId());
}

function logEvent(data) {
  console.log(`\x1b[36m[YandexFactCheck]\x1b[0m`, JSON.stringify(data));
}

/**
 * Собирает тексты контекста в одну строку, обрезая до maxContextChars.
 * @param {unknown[]} contextTexts
 * @returns {string}
 */
function buildContextBundle(contextTexts) {
  const max = maxContextChars();
  const texts = Array.isArray(contextTexts)
    ? contextTexts.filter((t) => typeof t === "string" && t.trim())
    : [];
  let result = "";
  for (const t of texts) {
    if (result.length + t.length > max) {
      result += t.slice(0, max - result.length);
      break;
    }
    result += t + "\n\n";
  }
  return result.trim();
}

/**
 * Извлекает текст ответа из структуры Yandex responses API.
 * @param {unknown} data
 * @returns {string}
 */
function extractAssistantTextFromYandexResponse(data) {
  // responses API
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
  // chat/completions API
  const choice = data?.choices?.[0];
  return choice?.message?.content || choice?.delta?.content || "";
}

// ─── Yandex API calls ─────────────────────────────────────────────────────────

async function callYandexResponses(input, key, uri, maxOut) {
  const res = await fetch(yandexResponsesUrl(), {
    method: "POST",
    headers: {
      Authorization: "Api-Key " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: uri,
      instructions: FACT_CHECK_INSTRUCTIONS,
      input,
      temperature: 0.1,
      max_output_tokens: maxOut,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Yandex responses API ${res.status}: ${err}`);
  }
  return res.json();
}

async function callYandexChat(input, key, uri, maxOut) {
  const res = await fetch(yandexChatUrl(), {
    method: "POST",
    headers: {
      Authorization: "Api-Key " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: uri,
      messages: [
        { role: "system", content: FACT_CHECK_INSTRUCTIONS },
        { role: "user", content: input },
      ],
      temperature: 0.1,
      max_tokens: maxOut,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Yandex chat/completions API ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Прогоняет черновик через судью Yandex.
 * Возвращает скорректированный текст (или исходный при ошибке/отключении).
 *
 * @param {string}    draftText    - Черновик ответа ассистента
 * @param {unknown[]} contextTexts - Тексты, попавшие в контекст LLM
 * @returns {Promise<string>}
 */
async function applyYandexFactCheck(draftText = "", contextTexts = []) {
  if (!draftText || typeof draftText !== "string" || draftText.trim().length < 10) {
    return draftText;
  }
  if (!isEnabled()) {
    logEvent({ phase: "skip", reason: "disabled_or_no_keys" });
    return draftText;
  }

  const key = apiKey();
  const uri = modelUri();
  const maxOut = Math.max(512, Math.min(8192, Math.ceil(draftText.length * 1.2)));
  const contextBundle = buildContextBundle(contextTexts);
  const input =
    (contextBundle
      ? `<context>\n${contextBundle}\n</context>\n\n`
      : "") +
    `<draft>\n${draftText}\n</draft>`;

  logEvent({ phase: "start", model: uri, draftLen: draftText.length, contextLen: contextBundle.length });
  const t0 = Date.now();

  try {
    let data;
    try {
      data = await callYandexResponses(input, key, uri, maxOut);
    } catch (e) {
      logEvent({ phase: "responses_failed", error: e.message, fallback: "chat/completions" });
      data = await callYandexChat(input, key, uri, maxOut);
    }

    const result = extractAssistantTextFromYandexResponse(data);
    if (!result || result.trim().length < 5) {
      logEvent({ phase: "empty_response", ms: Date.now() - t0 });
      return draftText;
    }

    logEvent({
      phase: "done",
      ms: Date.now() - t0,
      inLen: draftText.length,
      outLen: result.length,
      changed: result !== draftText,
    });
    return result;
  } catch (e) {
    logEvent({ phase: "error", error: e.message, ms: Date.now() - t0 });
    return draftText;
  }
}

module.exports = {
  applyYandexFactCheck,
  extractAssistantTextFromYandexResponse,
  FACT_CHECK_INSTRUCTIONS,
};
