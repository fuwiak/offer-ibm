"use strict";

/**
 * Gate: should the current user message become RFQ / КП draft line(s)?
 *
 * Ordinary chat («что ты умеешь», «покажи сводку», follow-up chips) must NOT
 * be fed into parseInquiryText → matchInquiryToDraft. Real product lines and
 * multi-line RFQs must still pass.
 *
 * Heuristics are always authoritative when confident. Optional LLM judge only
 * when OFFER_KP_STRICT_DETERMINISM is off and heuristics are ambiguous.
 */

const {
  OFFER_KP_INTENTS,
  START_QUOTE_PROMPTS,
  routeOfferKpMessage,
  normalizeIntentText,
} = require("./intentRouter");
const { offerKpStrictDeterminismEnabled, resolveOfferKpChatSampling } = require("./deterministicSampling");
const { RESPONSE_FORMATS } = require("./llmJsonSchema");

const CHAT_INTENTS = new Set([
  OFFER_KP_INTENTS.CASUAL_OR_TEST,
  OFFER_KP_INTENTS.SYSTEM_HELP,
  OFFER_KP_INTENTS.DOCUMENT_QUESTION,
  OFFER_KP_INTENTS.DATA_QUESTION,
  OFFER_KP_INTENTS.OUT_OF_SCOPE,
  OFFER_KP_INTENTS.UNSAFE_OR_FORBIDDEN,
]);

const INQUIRY_INTENTS = new Set([
  OFFER_KP_INTENTS.PRODUCT_INQUIRY,
  OFFER_KP_INTENTS.CREATE_QUOTE,
]);

const ADD_POSITION_RE =
  /(?:добавь|добавить|вставь|допиши|дополни).{0,20}(?:позици|строк|товар)|(?:add|append).{0,20}(?:line|item|position)/iu;

const CHAT_QUESTION_RE =
  /^(?:что|как|почему|зачем|где|когда|кто|какой|какая|какие|каково|какова|сколько|покажи|выведи|объясни|расскажи|напомни|помоги|умеешь|привет|здравствуй|спасибо|ок|хорошо|да|нет)\b/iu;

const DRAFT_FOLLOWUP_RE =
  /(?:общая\s+сумма|итог\s+текущего\s+списка|сколько\s+позиций|деш[её]в\w*\s+доступн\w*\s+аналог|total\s+for\s+the\s+current|how\s+many\s+items|current\s+item\s+list|najta[nń]sze\s+dostępne|łączna\s+suma)/iu;

const INQUIRY_LINE_JUDGE_PROMPT = `Ты классификатор для OfferKP. Ответь ТОЛЬКО JSON {"contribute":true|false}.
contribute=true — сообщение содержит позицию(и) заявки/крепежа для черновика КП (DIN/ГОСТ, размер, кол-во, «добавь позицию: …», многострочный RFQ).
contribute=false — обычный вопрос, команда UI, follow-up («покажи сводку», «почему цена», «что умеешь», «добавь НДС»), без новой товарной строки.
Если сомневаешься — contribute=false.`;

function hasQtySignal(text = "") {
  return /(?:^|[^\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:шт|штук|кг|м|уп|упак|pack|pcs?)(?:$|[^\p{L}\p{N}])/iu.test(
    String(text || "")
  );
}

function isStartQuotePrompt(text = "") {
  const normalized = normalizeIntentText(text);
  return START_QUOTE_PROMPTS.some(
    (prompt) => normalizeIntentText(prompt) === normalized
  );
}

/**
 * Deterministic decision: true | false | null (ambiguous).
 * @returns {{ contribute: boolean|null, reason: string }}
 */
function classifyInquiryMessageContribution(message = "", options = {}) {
  const text = String(message || "").trim();
  if (!text) return { contribute: false, reason: "empty" };

  const intent =
    options.resolvedIntent?.primaryIntent ||
    routeOfferKpMessage(text).primaryIntent;

  try {
    const { isQuoteCommandOnly } = require("./quoteRequestPhrases");
    if (isQuoteCommandOnly(text)) {
      return { contribute: false, reason: "quote_command_only" };
    }
  } catch {
    /* optional */
  }

  if (isStartQuotePrompt(text)) {
    return { contribute: false, reason: "start_quote_prompt" };
  }

  if (DRAFT_FOLLOWUP_RE.test(text) && !hasHardwareSignalsSafe(text)) {
    return { contribute: false, reason: "draft_followup_chip" };
  }

  if (CHAT_INTENTS.has(intent)) {
    return { contribute: false, reason: `intent:${intent}` };
  }

  if (intent === OFFER_KP_INTENTS.EDIT_QUOTE) {
    if (ADD_POSITION_RE.test(text) && hasHardwareSignalsSafe(text)) {
      return { contribute: true, reason: "edit_add_position" };
    }
    return { contribute: false, reason: "edit_quote_no_new_line" };
  }

  if (intent === OFFER_KP_INTENTS.PRODUCT_SEARCH) {
    // Search/compare Q&A without explicit qty+line → catalog search, not draft append.
    if (!(hasHardwareSignalsSafe(text) && hasQtySignal(text))) {
      return { contribute: false, reason: "product_search_no_qty_line" };
    }
  }

  if (CHAT_QUESTION_RE.test(text) && !hasHardwareSignalsSafe(text)) {
    return { contribute: false, reason: "chat_question" };
  }

  const lineCount = countInquiryLinesSafe(text);
  if (lineCount >= 2 && hasHardwareSignalsSafe(text)) {
    return { contribute: true, reason: "multi_line_rfq" };
  }

  if (ADD_POSITION_RE.test(text) && hasHardwareSignalsSafe(text)) {
    return { contribute: true, reason: "explicit_add_position" };
  }

  if (
    INQUIRY_INTENTS.has(intent) &&
    hasHardwareSignalsSafe(text) &&
    (hasQtySignal(text) || lineCount >= 1)
  ) {
    // Single product line with DIN/type — OK. Pure create_quote without hardware
    // already handled by quote_command_only / start_quote_prompt.
    if (hasHardwareSignalsSafe(text)) {
      return { contribute: true, reason: `intent_rfq:${intent}` };
    }
  }

  if (hasHardwareSignalsSafe(text) && hasQtySignal(text)) {
    return { contribute: true, reason: "hardware_plus_qty" };
  }

  if (hasHardwareSignalsSafe(text) && text.length <= 160 && !CHAT_QUESTION_RE.test(text)) {
    return { contribute: true, reason: "short_hardware_line" };
  }

  // Ambiguous: conversational length without hardware → chat; else null for LLM.
  if (!hasHardwareSignalsSafe(text) && text.length <= 200) {
    return { contribute: false, reason: "no_hardware_short" };
  }

  return { contribute: null, reason: "ambiguous" };
}

function hasHardwareSignalsSafe(text) {
  try {
    const { hasHardwareSignals } = require("./productSearchAgent");
    return hasHardwareSignals(text);
  } catch {
    return /(?:din|гост|gost|iso)\s*\d|(?:болт|гайк|шайб|винт|шпильк)/iu.test(
      String(text || "")
    );
  }
}

function countInquiryLinesSafe(text) {
  try {
    const { parseInquiryText } = require("./parseInquiry");
    return parseInquiryText(text).length;
  } catch {
    return String(text || "")
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean).length;
  }
}

function parseContributeAnswer(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed?.contribute === "boolean") return parsed.contribute;
  } catch {
    /* ignore */
  }
  return null;
}

async function classifyInquiryContributionWithLlm(message, { workspace = null } = {}) {
  if (offerKpStrictDeterminismEnabled()) return null;
  if (process.env.OFFER_KP_INQUIRY_LINE_LLM_JUDGE === "false") return null;

  const trimmed = String(message || "").trim();
  if (!trimmed) return null;

  try {
    const { getLLMProviderWithFallback } = require("../helpers");
    const LLMConnector = await getLLMProviderWithFallback({
      provider: workspace?.chatProvider || null,
      model: workspace?.chatModel || null,
    });
    const { textResponse } = await LLMConnector.getChatCompletion(
      [
        { role: "system", content: INQUIRY_LINE_JUDGE_PROMPT },
        { role: "user", content: trimmed.slice(0, 800) },
      ],
      resolveOfferKpChatSampling({
        response_format: RESPONSE_FORMATS.inquiryLineContribute,
      })
    );
    return parseContributeAnswer(textResponse);
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ contribute: boolean, reason: string, source: "heuristic"|"llm"|"fail_safe" }>}
 */
async function shouldMessageContributeInquiryLines(message = "", options = {}) {
  const heuristic = classifyInquiryMessageContribution(message, options);
  if (heuristic.contribute === true) {
    return { contribute: true, reason: heuristic.reason, source: "heuristic" };
  }
  if (heuristic.contribute === false) {
    return { contribute: false, reason: heuristic.reason, source: "heuristic" };
  }

  const llm = await classifyInquiryContributionWithLlm(message, options);
  if (typeof llm === "boolean") {
    return {
      contribute: llm,
      reason: llm ? "llm_yes" : "llm_no",
      source: "llm",
    };
  }

  // Fail-safe: never invent draft lines from ambiguous chat.
  return { contribute: false, reason: "ambiguous_fail_safe", source: "fail_safe" };
}

module.exports = {
  classifyInquiryMessageContribution,
  shouldMessageContributeInquiryLines,
  parseContributeAnswer,
  CHAT_INTENTS,
  INQUIRY_INTENTS,
};
