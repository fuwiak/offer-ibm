"use strict";

/**
 * Судья №2 — OpenRouter ГАРАНТ fact-check.
 *
 * Берёт черновик и фильтрует из контекста только фрагменты ГАРАНТ,
 * затем прогоняет черновик через цепочку OpenRouter-моделей.
 * Каждая модель может скорректировать ответ; результат передаётся следующей.
 *
 * Цель: убрать выдуманные номера статей/пунктов/ФЗ, которые не подкреплены
 * реальными выдержками ГАРАНТ.
 *
 * По умолчанию ВЫКЛЮЧЕН (OPENROUTER_GARANT_FACT_CHECK_ENABLED_IN_CODE = false).
 * Включение: OPENROUTER_FACT_CHECK_ENABLED=true в env.
 *
 * Внешний HTTP API:
 *   POST https://openrouter.ai/api/v1/chat/completions
 *   Authorization: Bearer <OPENROUTER_API_KEY>
 *   Content-Type: application/json
 *
 * Переменные окружения:
 *   OPENROUTER_FACT_CHECK_ENABLED      — включить судью
 *   OPENROUTER_FACT_CHECK_DISABLED     — принудительно выключить
 *   OPENROUTER_FACT_CHECK_MODELS       — JSON-список моделей или CSV
 *                                        default: ["deepseek/deepseek-r1","openai/gpt-4o-mini"]
 *   OPENROUTER_API_KEY                 — ключ API OpenRouter (обязателен)
 *   GARANT_TOKEN                       — нужен, чтобы судья вообще получил ГАРАНТ-контекст
 *   OPENROUTER_BASE_URL                — base URL (default: https://openrouter.ai/api/v1)
 */

const OPENROUTER_GARANT_FACT_CHECK_ENABLED_IN_CODE = false;

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODELS = ["deepseek/deepseek-r1", "openai/gpt-4o-mini"];

// Маркеры ГАРАНТ-блоков в контексте
const GARANT_MARKERS = ["[ГАРАНТ", "[Гарант", "GARANT", "КонсультантПлюс"];

// ─── System prompt ─────────────────────────────────────────────────────────────

const GARANT_FACT_CHECK_SYSTEM = `Ты юридический корректор. Тебе дают:
1. Выдержки из системы ГАРАНТ (КонсультантПлюс) — это первичный источник истины.
2. Черновик ответа ассистента.

Задача — убрать или исправить любые ссылки на статьи, пункты, федеральные законы, постановления и нормы, которых НЕТ в предоставленных выдержках ГАРАНТ.
Правила:
- Если статья/норма есть в ГАРАНТ — оставь ссылку как есть.
- Если статьи/нормы нет в ГАРАНТ — замени конкретную ссылку на общую фразу вида «согласно действующему законодательству» или убери её.
- Не добавляй новых утверждений сверх контекста.
- Сохраняй структуру и стиль черновика.
- Верни только исправленный текст без комментариев.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openRouterApiKey() {
  return (process.env.OPENROUTER_API_KEY || "").trim();
}

function openRouterBaseUrl() {
  return (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/$/,
    ""
  );
}

function parseModels() {
  const raw = (process.env.OPENROUTER_FACT_CHECK_MODELS || "").trim();
  if (!raw) return DEFAULT_MODELS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // try CSV
  }
  const csv = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return csv.length > 0 ? csv : DEFAULT_MODELS;
}

function isEnabled() {
  if (!OPENROUTER_GARANT_FACT_CHECK_ENABLED_IN_CODE) {
    const envOn = ["1", "true", "yes"].includes(
      (process.env.OPENROUTER_FACT_CHECK_ENABLED || "").toLowerCase()
    );
    if (!envOn) return false;
  }
  if (
    ["1", "true", "yes"].includes(
      (process.env.OPENROUTER_FACT_CHECK_DISABLED || "").toLowerCase()
    )
  )
    return false;
  return !!openRouterApiKey();
}

function logEvent(data) {
  console.log(
    `\x1b[35m[OpenRouterGarantFactCheck]\x1b[0m`,
    JSON.stringify(data)
  );
}

/**
 * Фильтрует только ГАРАНТ-фрагменты из массива текстов контекста.
 */
function filterGarantChunks(contextTexts) {
  if (!Array.isArray(contextTexts)) return [];
  return contextTexts.filter(
    (t) =>
      typeof t === "string" &&
      GARANT_MARKERS.some((marker) => t.includes(marker))
  );
}

/**
 * Собирает ГАРАНТ-фрагменты в одну строку (max 20 000 символов).
 */
function buildGarantBundle(garantChunks) {
  const MAX = 20_000;
  let result = "";
  for (const chunk of garantChunks) {
    if (result.length + chunk.length > MAX) {
      result += chunk.slice(0, MAX - result.length);
      break;
    }
    result += chunk + "\n\n";
  }
  return result.trim();
}

/**
 * Один вызов OpenRouter.
 * @param {string} draftText
 * @param {string} garantBundle
 * @param {string} model
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
async function callOpenRouterOnce(draftText, garantBundle, model, apiKey) {
  const userContent = garantBundle
    ? `<garant_context>\n${garantBundle}\n</garant_context>\n\n<draft>\n${draftText}\n</draft>`
    : draftText;

  const res = await fetch(`${openRouterBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://offer-kp.ru",
      "X-Title": "LegalRAG FactCheck",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: GARANT_FACT_CHECK_SYSTEM },
        { role: "user", content: userContent },
      ],
      temperature: 0.05,
      max_tokens: Math.max(
        512,
        Math.min(8192, Math.ceil(draftText.length * 1.3))
      ),
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${model} ${res.status}: ${err}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string" || text.trim().length < 5)
    return draftText;
  return text;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Прогоняет черновик через цепочку OpenRouter-моделей с контекстом ГАРАНТ.
 * Каждая модель может подправить предыдущий результат.
 *
 * @param {string}    draftText    - Черновик ответа ассистента
 * @param {unknown[]} contextTexts - Полный контекст запроса
 * @returns {Promise<string>}
 */
async function applyOpenRouterGarantFactCheck(
  draftText = "",
  contextTexts = []
) {
  if (
    !draftText ||
    typeof draftText !== "string" ||
    draftText.trim().length < 10
  ) {
    return draftText;
  }
  if (!isEnabled()) {
    logEvent({ phase: "skip", reason: "disabled_or_no_api_key" });
    return draftText;
  }

  const garantChunks = filterGarantChunks(contextTexts);
  if (garantChunks.length === 0) {
    logEvent({ phase: "skip", reason: "no_garant_chunks_in_context" });
    return draftText;
  }

  const garantBundle = buildGarantBundle(garantChunks);
  const models = parseModels();
  const apiKey = openRouterApiKey();

  logEvent({
    phase: "start",
    models,
    garantChunks: garantChunks.length,
    garantBundleLen: garantBundle.length,
    draftLen: draftText.length,
  });

  let current = draftText;
  const t0 = Date.now();

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const stepStart = Date.now();
    try {
      const next = await callOpenRouterOnce(
        current,
        garantBundle,
        model,
        apiKey
      );
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
    } catch (e) {
      logEvent({
        phase: "step_error",
        stepIndex: i + 1,
        model,
        error: e.message,
      });
      // continue with current text
    }
  }

  logEvent({
    phase: "done",
    totalMs: Date.now() - t0,
    steps: models.length,
    finalLen: current.length,
    changed: current !== draftText,
  });
  return current;
}

module.exports = {
  applyOpenRouterGarantFactCheck,
  filterGarantChunks,
  GARANT_FACT_CHECK_SYSTEM,
};
