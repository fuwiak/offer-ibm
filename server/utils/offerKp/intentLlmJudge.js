"use strict";

/**
 * Second-opinion LLM judge for messages the deterministic intentRouter
 * itself could not classify confidently (`ambiguous`, confidence 0.55).
 * Confident router categories never pay for this — it only fires on the
 * rare tie-break case, keeping it cheap on the shared GPU.
 *
 * Closed-set classification only (one category code). Independent of
 * OFFER_KP_STRICT_DETERMINISM: strict mode still pins sampling / disables
 * generative ranking, but this judge does not invent prices or SKUs.
 * Kill-switch: OFFER_KP_INTENT_LLM_JUDGE=false.
 */

const {
  OFFER_KP_INTENTS,
  routeOfferKpMessage,
  buildResult,
  needsLlmIntentJudge,
} = require("./intentRouter");
const { getLLMProviderWithFallback } = require("../helpers");
const { offerKpLog } = require("../offerKpApp/offerKpLog");
const { resolveOfferKpChatSampling } = require("./deterministicSampling");
const { RESPONSE_FORMATS } = require("./llmJsonSchema");
const {
  resolveOpenRouterApiKey,
  resolveOpenRouterBaseUrl,
  resolveOpenRouterHeaders,
} = require("../offerKpApp/openRouterEnv");
const {
  recordExperienceEvent,
  rememberExperienceAsync,
  retrieveExperiences,
} = require("./experienceMemory");
const { TtlLruCache, sha256 } = require("./db/layeredCache");

const DEFAULT_INTENT_MODEL = "deepseek/deepseek-v4-flash";

const JUDGE_CATEGORIES = [
  OFFER_KP_INTENTS.PRODUCT_INQUIRY,
  OFFER_KP_INTENTS.PRODUCT_SEARCH,
  OFFER_KP_INTENTS.CREATE_QUOTE,
  OFFER_KP_INTENTS.EDIT_QUOTE,
  OFFER_KP_INTENTS.DOCUMENT_QUESTION,
  OFFER_KP_INTENTS.DATA_QUESTION,
  OFFER_KP_INTENTS.SYSTEM_HELP,
  OFFER_KP_INTENTS.CASUAL_OR_TEST,
  OFFER_KP_INTENTS.OUT_OF_SCOPE,
];

const INTENT_JUDGE_PROMPT = `Ты классификатор намерений для OfferKP — ассистента по каталогу крепежа purolat.com.
Детерминированный маршрутизатор не смог уверенно определить категорию сообщения. Выбери ОДНУ наиболее вероятную категорию из списка и ответь ТОЛЬКО JSON {"category":"<код>"} без пояснений:
product_inquiry — конкретный запрос с параметрами товара (DIN/ГОСТ, размер, количество)
product_search — просьба найти/подобрать/сравнить товар или аналог
create_quote — просьба сформировать новое коммерческое предложение (КП)
edit_quote — просьба изменить/дополнить/пересобрать уже обсуждаемое КП
document_question — вопрос о содержимом прикреплённого файла или уже сформированного КП, без запроса на изменение
data_question — вопрос об агрегатах/структуре каталога ShopDB (сколько товаров, категории, дубликаты SKU, min/max цены)
system_help — вопрос о возможностях самого ассистента
casual_or_test — приветствие, проверка связи, сообщение не по теме крепежа
out_of_scope — вопрос вне тематики крепежа/КП (погода, история стандартов и т.п.)
Сообщение может быть на любом языке — язык сам по себе не признак категории. Если сомневаешься — выбери out_of_scope.`;

function intentLlmJudgeEnabled() {
  return process.env.OFFER_KP_INTENT_LLM_JUDGE !== "false";
}

// Same ambiguous text + same model + same prompt → same category. Judge is
// closed-set classification (no user state), so the verdict is shareable
// across threads/users. Deterministic router is NOT cached — regex is
// cheaper than any cache lookup.
const INTENT_JUDGE_CACHE_TTL_MS = Math.max(
  60_000,
  parseInt(process.env.OFFER_KP_INTENT_CACHE_TTL_MS, 10) || 24 * 60 * 60 * 1000
);
const intentJudgeCache = new TtlLruCache({
  ttlMs: INTENT_JUDGE_CACHE_TTL_MS,
  maxEntries: Math.max(
    100,
    parseInt(process.env.OFFER_KP_INTENT_CACHE_MAX, 10) || 2000
  ),
});
const INTENT_PROMPT_VERSION = sha256(INTENT_JUDGE_PROMPT).slice(0, 8);

function intentJudgeCacheKey(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return `intent:v1:${resolveIntentModel()}:${INTENT_PROMPT_VERSION}:${sha256(normalized)}`;
}

/** Test helper. */
function clearIntentJudgeCache() {
  intentJudgeCache.clear();
}

function resolveIntentModel() {
  return (
    String(process.env.OFFER_KP_INTENT_MODEL || "").trim() ||
    DEFAULT_INTENT_MODEL
  );
}

function formatIntentMemory(examples = []) {
  if (!examples.length) return "";
  return [
    "Похожие ранее проверенные решения (только подсказка, классифицируй текущий текст самостоятельно):",
    ...examples.map(
      (row) =>
        `- ${JSON.stringify(row.payload?.user_text || row.retrieval_text)} → ${
          row.payload?.intent || row.canonical_text
        }`
    ),
  ].join("\n");
}

async function callOpenRouterIntentJudge(messages) {
  const apiKey = resolveOpenRouterApiKey();
  if (!apiKey) return null;
  const response = await fetch(
    `${resolveOpenRouterBaseUrl()}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...resolveOpenRouterHeaders(),
      },
      body: JSON.stringify({
        model: resolveIntentModel(),
        messages,
        ...resolveOfferKpChatSampling({
          response_format: RESPONSE_FORMATS.intentCategory,
        }),
      }),
      signal: AbortSignal.timeout(20_000),
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      body?.error?.message || body?.message || `HTTP ${response.status}`
    );
  }
  return String(body?.choices?.[0]?.message?.content || "");
}

function parseIntentAnswer(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const objStart = raw.indexOf("{");
  const objEnd = raw.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const parsed = JSON.parse(raw.slice(objStart, objEnd + 1));
      const category = String(parsed?.category || "")
        .trim()
        .toLowerCase();
      if (JUDGE_CATEGORIES.includes(category)) return category;
    } catch {
      /* fall through to legacy plain-text parse */
    }
  }

  const t = raw.toLowerCase();
  return JUDGE_CATEGORIES.find((c) => t === c || t.startsWith(c)) || null;
}

/**
 * @param {string} text
 * @param {{ workspace?: object|null }} [options]
 * @returns {Promise<string|null>} one of OFFER_KP_INTENTS, or null on failure/disabled
 */
async function classifyAmbiguousIntentWithLlm(text, { workspace = null } = {}) {
  if (!intentLlmJudgeEnabled()) return null;
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  const cacheKey = intentJudgeCacheKey(trimmed);
  const cachedCategory = intentJudgeCache.get(cacheKey);
  if (cachedCategory) {
    offerKpLog("info", "Ambiguous intent LLM judge (cache hit)", {
      category: cachedCategory,
      snippet: trimmed.slice(0, 120),
    });
    return cachedCategory;
  }

  try {
    const memories = await retrieveExperiences("intent_memory", trimmed, {
      limit: 3,
      minSimilarity: 0.58,
    });
    const memoryBlock = formatIntentMemory(memories);
    const messages = [
      {
        role: "system",
        content: [INTENT_JUDGE_PROMPT, memoryBlock]
          .filter(Boolean)
          .join("\n\n"),
      },
      { role: "user", content: trimmed.slice(0, 600) },
    ];
    let textResponse = null;
    let model = resolveIntentModel();
    try {
      textResponse = await callOpenRouterIntentJudge(messages);
    } catch (error) {
      offerKpLog("warn", "OpenRouter intent judge failed, using fallback", {
        model,
        error: error?.message || String(error),
      });
    }
    if (textResponse == null) {
      const LLMConnector = await getLLMProviderWithFallback({
        provider: workspace?.chatProvider || null,
        model: workspace?.chatModel || null,
      });
      const result = await LLMConnector.getChatCompletion(
        messages,
        resolveOfferKpChatSampling({
          response_format: RESPONSE_FORMATS.intentCategory,
        })
      );
      textResponse = result.textResponse;
      model = workspace?.chatModel || "workspace_fallback";
    }
    const category = parseIntentAnswer(textResponse);
    const event = recordExperienceEvent("intent_classified", {
      input: trimmed.slice(0, 2_000),
      output: category,
      model,
      pipeline_stage: "intent",
      retrieved_examples: memories.length,
      trust_level: category ? "teacher_verified_by_code" : "teacher_only",
    });
    if (category) {
      intentJudgeCache.set(cacheKey, category);
      rememberExperienceAsync({
        namespace: "intent_memory",
        retrievalText: `USER_TEXT: ${trimmed}\nINTENT_MEANING: ${category}`,
        canonicalText: category,
        payload: { user_text: trimmed, intent: category },
        trustLevel: "teacher_verified_by_code",
        sourceEventId: event?.id || null,
      });
    }
    offerKpLog("info", "Ambiguous intent LLM judge", {
      category,
      snippet: trimmed.slice(0, 120),
      model,
      memories: memories.length,
    });
    return category;
  } catch (err) {
    offerKpLog("warn", "Ambiguous intent LLM judge failed", {
      error: err?.message || String(err),
    });
    return null;
  }
}

/**
 * Sync router first; only escalates to the LLM tie-breaker when the
 * deterministic router itself landed on `ambiguous`.
 * @param {string} text
 * @param {{ workspace?: object|null }} [options]
 */
async function resolveOfferKpIntent(text, { workspace = null } = {}) {
  const routed = routeOfferKpMessage(text);
  if (!needsLlmIntentJudge(routed)) return routed;

  const judged = await classifyAmbiguousIntentWithLlm(text, { workspace });
  if (!judged) return routed;

  return buildResult({
    primaryIntent: judged,
    intents: routed.intents,
    confidence: 0.75,
    signals: { ...routed.signals, llmJudge: true },
  });
}

module.exports = {
  JUDGE_CATEGORIES,
  DEFAULT_INTENT_MODEL,
  resolveIntentModel,
  formatIntentMemory,
  intentLlmJudgeEnabled,
  clearIntentJudgeCache,
  parseIntentAnswer,
  classifyAmbiguousIntentWithLlm,
  resolveOfferKpIntent,
};
