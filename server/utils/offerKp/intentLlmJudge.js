"use strict";

/**
 * Second-opinion LLM judge for messages the deterministic intentRouter
 * itself could not classify confidently (`ambiguous`, confidence 0.55).
 * Confident router categories never pay for this — it only fires on the
 * rare tie-break case, keeping it cheap on the shared GPU.
 */

const {
  OFFER_KP_INTENTS,
  routeOfferKpMessage,
  buildResult,
} = require("./intentRouter");
const { getLLMProviderWithFallback } = require("../helpers");
const { offerKpLog } = require("../offerKpApp/offerKpLog");

const JUDGE_CATEGORIES = [
  OFFER_KP_INTENTS.PRODUCT_INQUIRY,
  OFFER_KP_INTENTS.PRODUCT_SEARCH,
  OFFER_KP_INTENTS.CREATE_QUOTE,
  OFFER_KP_INTENTS.EDIT_QUOTE,
  OFFER_KP_INTENTS.DOCUMENT_QUESTION,
  OFFER_KP_INTENTS.SYSTEM_HELP,
  OFFER_KP_INTENTS.CASUAL_OR_TEST,
  OFFER_KP_INTENTS.OUT_OF_SCOPE,
];

const INTENT_JUDGE_PROMPT = `Ты классификатор намерений для OfferKP — ассистента по каталогу крепежа purolat.com.
Детерминированный маршрутизатор не смог уверенно определить категорию сообщения. Выбери ОДНУ наиболее вероятную категорию из списка и ответь ТОЛЬКО её кодом, без пояснений и знаков препинания:
product_inquiry — конкретный запрос с параметрами товара (DIN/ГОСТ, размер, количество)
product_search — просьба найти/подобрать/сравнить товар или аналог
create_quote — просьба сформировать новое коммерческое предложение (КП)
edit_quote — просьба изменить/дополнить/пересобрать уже обсуждаемое КП
document_question — вопрос о содержимом прикреплённого файла или уже сформированного КП, без запроса на изменение
system_help — вопрос о возможностях самого ассистента
casual_or_test — приветствие, проверка связи, сообщение не по теме крепежа
out_of_scope — вопрос вне тематики крепежа/КП (погода, история стандартов и т.п.)
Сообщение может быть на любом языке — язык сам по себе не признак категории. Если сомневаешься — выбери out_of_scope.`;

function intentLlmJudgeEnabled() {
  return process.env.OFFER_KP_INTENT_LLM_JUDGE !== "false";
}

function parseIntentAnswer(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase();
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

  try {
    const LLMConnector = await getLLMProviderWithFallback({
      provider: workspace?.chatProvider || null,
      model: workspace?.chatModel || null,
    });
    const messages = [
      { role: "system", content: INTENT_JUDGE_PROMPT },
      { role: "user", content: trimmed.slice(0, 600) },
    ];
    const { textResponse } = await LLMConnector.getChatCompletion(messages, {
      temperature: 0,
    });
    const category = parseIntentAnswer(textResponse);
    offerKpLog("info", "Ambiguous intent LLM judge", {
      category,
      snippet: trimmed.slice(0, 120),
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
  if (routed.primaryIntent !== OFFER_KP_INTENTS.AMBIGUOUS) return routed;

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
  intentLlmJudgeEnabled,
  parseIntentAnswer,
  classifyAmbiguousIntentWithLlm,
  resolveOfferKpIntent,
};
