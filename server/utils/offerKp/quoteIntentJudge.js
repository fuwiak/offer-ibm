const { wantsFileCreation } = require("../chats/agents");
const { isOfferFollowUp } = require("./productSearchAgent");
const { getLLMProviderWithFallback } = require("../helpers");
const { offerKpLog } = require("../offerKpApp/offerKpLog");
const { OFFER_KP_INTENTS, routeOfferKpMessage } = require("./intentRouter");

const QUOTE_FILE_SKILLS = new Set([
  "create-docx-file",
  "create-pdf-file",
  "create-text-file",
]);

const QUOTE_INTENT_LLM_PROMPT = `Ты классификатор намерений для OfferKP (каталог purolat.com).
Определи, хочет ли пользователь сформировать коммерческое предложение (КП, оферту, ofertę, commercial proposal, quote document) или связанный файл Word/PDF с таблицей позиций и цен.
Ответь ТОЛЬКО одним словом: yes или no.
yes — если пользователь просит создать, обновить или переделать КП/оферту/DOCX/PDF с позициями и ценами либо подтверждает такое действие.
no — если речь о другом документе (отчёт, презентация, письмо, резюме и т.п.) или намерение неясно.`;

function quoteIntentLlmJudgeEnabled() {
  if (process.env.OFFER_KP_QUOTE_INTENT_LLM_JUDGE === "false") return false;
  return true;
}

function extractRecentUserMessages(chats = [], limit = 8) {
  const messages = [];
  for (let i = chats.length - 1; i >= 0 && messages.length < limit; i--) {
    const chat = chats[i];
    if (chat?.from !== "USER" || !chat?.content) continue;
    messages.unshift(String(chat.content).trim());
  }
  return messages;
}

function payloadLooksLikeQuote({ payload = {} } = {}) {
  const title = String(payload.title || "").trim();
  const filename = String(payload.filename || "").trim();
  const content = String(payload.content || "").trim();

  if (/коммерческ|commercial|propozycj|ofert|\bкп\b|quote/i.test(title)) {
    return true;
  }
  if (/^kp[_-]|[_-]kp\.|ofert|quote|коммерческ/i.test(filename)) {
    return true;
  }
  if (content) {
    if (/#+\s*коммерческ|commercial proposal|oferta/i.test(content)) {
      return true;
    }
    if (
      /\|\s*№\s*\|/.test(content) &&
      /\|\s*---/.test(content) &&
      /цена|price|сумма|total/i.test(content)
    ) {
      return true;
    }
  }
  return false;
}

function hasQuoteMarker(text) {
  const t = String(text || "");
  return (
    /коммерческ|оферт|ofert|propozycj|commercial|quote/i.test(t) ||
    /(?:^|[\s,.(])кп(?:[\s,.!?)»]|$)/i.test(t)
  );
}

function detectQuoteCreationIntentSync(userMessages = []) {
  const list = userMessages.filter(Boolean);
  if (!list.length) return false;

  const combined = list.join("\n");
  const last = list.at(-1) || "";
  const routedLast = routeOfferKpMessage(last);
  if (routedLast.primaryIntent === OFFER_KP_INTENTS.UNSAFE_OR_FORBIDDEN) {
    return false;
  }
  if (routedLast.primaryIntent === OFFER_KP_INTENTS.CREATE_QUOTE) return true;
  if (
    routedLast.primaryIntent === OFFER_KP_INTENTS.EDIT_QUOTE &&
    /(?:кп|docx|pdf|word|документ|файл)/iu.test(last)
  ) {
    return true;
  }

  if (wantsFileCreation(combined)) return true;
  if (isOfferFollowUp(last) && combined.length >= 12) return true;

  if (
    /^(да|ok|tak|yes|сделай|сгенерируй|подготовь|wygeneruj|przygotuj)/i.test(
      last
    )
  ) {
    const prior = list.slice(0, -1).join("\n");
    if (wantsFileCreation(prior) || hasQuoteMarker(prior)) {
      return true;
    }
  }

  return false;
}

function mightNeedLlmQuoteJudge(userMessages = []) {
  const combined = userMessages.join("\n").toLowerCase();
  if (!combined.trim()) return false;
  return /doc|pdf|word|файл|документ|скач|download|gener|создай|create|make|подготов|przygot|wygener|ofert|кп|коммерческ|quote|propozycj/i.test(
    combined
  );
}

function parseYesNo(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase();
  if (/^(yes|да|tak|true|1)(?:\b|[,\s!?.]|$)/.test(t)) return true;
  if (/^(no|нет|false|0)(?:\b|[,\s!?.]|$)/.test(t)) return false;
  return /\byes\b|\bда\b|\btak\b/.test(t) && !/\bno\b|\bнет\b/.test(t);
}

async function detectQuoteCreationIntentWithLlm({
  userMessages = [],
  payload = {},
  skillName = "",
  workspace = null,
} = {}) {
  if (!quoteIntentLlmJudgeEnabled()) return false;
  if (
    !mightNeedLlmQuoteJudge(userMessages) &&
    !payloadLooksLikeQuote({ payload })
  ) {
    return false;
  }

  const LLMConnector = await getLLMProviderWithFallback({
    provider: workspace?.chatProvider || null,
    model: workspace?.chatModel || null,
  });

  const recent = userMessages.slice(-4).join("\n---\n");
  const payloadHint = [
    payload.filename ? `filename: ${payload.filename}` : "",
    payload.title ? `title: ${payload.title}` : "",
    skillName ? `tool: ${skillName}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const messages = [
    { role: "system", content: QUOTE_INTENT_LLM_PROMPT },
    {
      role: "user",
      content: `Сообщения пользователя:\n${recent || "(нет)"}\n\nКонтекст инструмента:\n${payloadHint || "(нет)"}`,
    },
  ];

  try {
    const { textResponse } = await LLMConnector.getChatCompletion(messages, {
      temperature: 0,
    });
    const approved = parseYesNo(textResponse);
    offerKpLog("info", "Quote intent LLM judge", {
      approved,
      skillName,
      snippet: recent.slice(0, 120),
    });
    return approved;
  } catch (err) {
    offerKpLog("warn", "Quote intent LLM judge failed", {
      error: err?.message || String(err),
    });
    return false;
  }
}

async function shouldAutoApproveQuoteFileSkill({
  skillName,
  payload = {},
  userMessages = [],
  workspace = null,
} = {}) {
  if (!QUOTE_FILE_SKILLS.has(skillName)) return false;
  if (payloadLooksLikeQuote({ payload })) return true;
  if (detectQuoteCreationIntentSync(userMessages)) return true;
  return detectQuoteCreationIntentWithLlm({
    userMessages,
    payload,
    skillName,
    workspace,
  });
}

module.exports = {
  QUOTE_FILE_SKILLS,
  extractRecentUserMessages,
  payloadLooksLikeQuote,
  detectQuoteCreationIntentSync,
  detectQuoteCreationIntentWithLlm,
  shouldAutoApproveQuoteFileSkill,
  quoteIntentLlmJudgeEnabled,
  mightNeedLlmQuoteJudge,
  parseYesNo,
};
