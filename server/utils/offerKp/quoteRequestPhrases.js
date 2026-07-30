const { wantsFileCreation } = require("../chats/agents");
const { OFFER_KP_INTENTS, routeOfferKpMessage } = require("./intentRouter");

/** Короткие фразы «сделай КП» / oferta — сразу @agent + Word/PDF. */
const SHORT_QUOTE_COMMAND_RES = [
  /^сделай\s+кп\b/i,
  /^сделать\s+кп\b/i,
  /^сформируй\s+кп\b/i,
  /^подготовь\s+кп\b/i,
  /^сгенерируй\s+кп\b/i,
  /^сделай\s+коммерческ/i,
  /^сделать\s+коммерческ/i,
  /^zrob\s+(kp|ofert)/i,
  /^zrób\s+(kp|ofertę|oferte|ofert)/i,
  /^przygotuj\s+(kp|ofert)/i,
  /^wygeneruj\s+(kp|ofert)/i,
  /^make\s+(a\s+)?(kp|quote|commercial\s+offer)/i,
  /^create\s+(a\s+)?(kp|quote|commercial\s+offer)/i,
  /^generate\s+(a\s+)?(kp|quote|commercial\s+offer)/i,
];

function hasQuoteMarker(text) {
  const t = String(text || "");
  return (
    /коммерческ|оферт|ofert|propozycj|commercial|quote/i.test(t) ||
    /(?:^|[\s,.(])кп(?:[\s,.!?)»]|$)/i.test(t)
  );
}

/**
 * UI / chat follow-up that points at prior prices/qty («на основе этих цен»),
 * without a fresh RFQ body. Intent still classifies; do not force the KP
 * document pipeline or an empty draft panel.
 */
function isQuoteFromPriorContextFollowUp(message = "") {
  const text = String(message || "")
    .replace(/^@agent\s*:?\s*/i, "")
    .trim();
  if (!text) return false;
  if (
    !/на основе (этих|текущ|предыдущ|приведённ|указанн)|по (этим|текущим|предыдущим|приведённым|указанным)|these (prices|quantities|items)|based on (these|those|the (above|previous|current))/iu.test(
      text
    )
  ) {
    return false;
  }
  // Real RFQ paste has DIN/ГОСТ/M-size signals. A whole-sentence false positive
  // from parseInquiry («…на основе этих цен…» → 1 bogus line) must not block.
  try {
    const { hasHardwareSignals } = require("./productSearchAgent");
    if (hasHardwareSignals(text)) return false;
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * @param {string} message
 * @returns {boolean}
 */
function isQuoteDocumentRequest(message = "") {
  const text = String(message || "")
    .replace(/^@agent\s*:?\s*/i, "")
    .trim();
  if (!text) return false;

  const routed = routeOfferKpMessage(text);
  if (routed.primaryIntent === OFFER_KP_INTENTS.UNSAFE_OR_FORBIDDEN) {
    return false;
  }

  // Soft follow-up → IntentDecision only (no forced KP file / empty panel path).
  if (isQuoteFromPriorContextFollowUp(text)) return false;

  if (SHORT_QUOTE_COMMAND_RES.some((re) => re.test(text))) return true;
  if (/\b(сделай|сформируй|подготовь|сгенерируй)\s+кп\b/i.test(text)) {
    return true;
  }
  if (wantsFileCreation(text)) return true;

  if (
    text.length <= 120 &&
    hasQuoteMarker(text) &&
    /сделай|сделать|сформируй|подготовь|zrob|zrób|przygotuj|wygeneruj|make|create|generate/i.test(
      text
    )
  ) {
    return true;
  }

  if (routed.primaryIntent === OFFER_KP_INTENTS.CREATE_QUOTE) return true;
  if (
    routed.primaryIntent === OFFER_KP_INTENTS.EDIT_QUOTE &&
    /(?:кп|docx|pdf|word|документ|файл)/iu.test(text)
  ) {
    return true;
  }

  return false;
}

function quoteDocumentStatusMessage() {
  return "@agent: Analyzing and verifying the source document…";
}

function quoteDocumentAgentGuidelines() {
  return [
    "Пользователь запросил коммерческое предложение (КП).",
    "Разрешены только два источника: приложенная заявка для перечня позиций/количеств/единиц и ShopDB для сопоставления товаров, SKU, наличия и цен.",
    "Не вызывай rag-memory, web-scraping, web-browsing и любые внешние поисковые инструменты: интернет, память и другие документы не являются источниками для КП.",
    "Инвариант полноты: если в заявке N строк, в таблице чата, DOCX и PDF должно быть ровно N товарных строк в исходном порядке. Не объединяй, не пропускай и не добавляй позиции.",
    "Перед DOCX/PDF посчитай суммы строк через quote-calculator (quantity × unitPrice).",
    "Обязательно вызови create-docx-file и create-pdf-file с markdown таблицей КП.",
    "Запрещено отвечать одной позицией, кратким описанием товара или списком из 1–2 SKU — нужна полная таблица КП по каждой строке заявки, включая строки без совпадения в ShopDB.",
    "Цены только из блоков [Каталог · purolat.com] в контексте.",
    "Если в сообщении пользователя есть секция «=== ДАННЫЕ КАТАЛОГА PUROLAT.COM (MySQL) ===» или блоки [Каталог · purolat.com] — они уже подставлены сервером. Запрещено писать, что блоков каталога нет.",
    "Запрещены вступления, извинения, мета-комментарии и темы вне КП (монтаж, логистика, другие магазины). В чате — таблица + 1–3 строки итога; документ — в DOCX/PDF.",
    "Не дублируй в ответе весь каталог — только строки заявки.",
    "После генерации кратко поясни состав КП в чате (сумма, НДС, ссылка на превью в панели).",
  ];
}

module.exports = {
  isQuoteDocumentRequest,
  isQuoteFromPriorContextFollowUp,
  quoteDocumentStatusMessage,
  quoteDocumentAgentGuidelines,
  hasQuoteMarker,
};
