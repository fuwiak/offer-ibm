const { wantsFileCreation } = require("../chats/agents");

/** Короткие фразы «сделай КП» / oferta — сразу @agent + Word/PDF. */
const SHORT_QUOTE_COMMAND_RES = [
  /^@agent\s+/i,
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
 * @param {string} message
 * @returns {boolean}
 */
function isQuoteDocumentRequest(message = "") {
  const text = String(message || "").trim();
  if (!text) return false;

  if (SHORT_QUOTE_COMMAND_RES.some((re) => re.test(text))) return true;
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

  return false;
}

function quoteDocumentStatusMessage() {
  return "@agent: Creating Word document…";
}

function quoteDocumentAgentGuidelines() {
  return [
    "Пользователь запросил коммерческое предложение (КП).",
    "Обязательно вызови create-docx-file и create-pdf-file с markdown таблицей КП.",
    "Цены только из блоков [Каталог · purolat.com] в контексте.",
    "Если в сообщении пользователя есть секция «=== ДАННЫЕ КАТАЛОГА PUROLAT.COM (MySQL) ===» или блоки [Каталог · purolat.com] — они уже подставлены сервером. Запрещено писать, что блоков каталога нет.",
    "После генерации кратко поясни состав КП в чате.",
  ];
}

module.exports = {
  isQuoteDocumentRequest,
  quoteDocumentStatusMessage,
  quoteDocumentAgentGuidelines,
  hasQuoteMarker,
};
