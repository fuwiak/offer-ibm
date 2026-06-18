/**
 * Разбор текста заявки на позиции крепежа.
 */

const { parseHardwareQuery } = require("./hardwareQuery");

const LINE_SPLIT_RE = /\n+|;\s*(?=\d)|(?<=\d)\s*[,;]\s*(?=\D)/;

function parseQuantity(text) {
  const m = String(text).match(
    /(\d+)\s*(?:шт\.?|штук|pcs|pieces|szt\.?|sztuk|ед\.?|units?)/i
  );
  if (m) return Math.max(1, parseInt(m[1], 10));
  const bare = String(text).match(/\b(\d{1,6})\b/);
  return bare ? Math.max(1, parseInt(bare[1], 10)) : 1;
}

function usesNonPieceUnit(text) {
  return /кг|kg|метр|meter|\bm\b(?!\s*\d)|упак|pack|л\s|литр/i.test(text);
}

function parseInquiryLine(lineText) {
  const raw = String(lineText || "").trim();
  if (!raw || raw.length < 3) return null;

  const parsed = parseHardwareQuery(raw);
  const quantity = parseQuantity(raw);
  const nonPiece = usesNonPieceUnit(raw);

  let name = raw
    .replace(/^\d+[\.)]\s*/, "")
    .replace(/\s*[-–—]\s*\d+\s*(?:шт|pcs).*$/i, "")
    .trim();

  if (!name) name = raw;

  return {
    raw,
    name,
    dinNumbers: parsed.dinNumbers,
    thread: parsed.thread,
    dimensions: parsed.dimensions,
    strengthClass: parsed.strengthClass,
    coating: parsed.coating,
    productTypes: parsed.productTypes,
    quantity,
    unit: nonPiece ? "?" : "шт",
    specialRequirements: extractSpecialRequirements(raw),
    needsReview: nonPiece,
  };
}

function extractSpecialRequirements(text) {
  const parts = [];
  if (/срочн|urgent|asap/i.test(text)) parts.push("срочно");
  if (/сертификат|certificate/i.test(text)) parts.push("сертификат");
  if (/упаков/i.test(text)) parts.push("упаковка");
  return parts.join("; ");
}

function parseInquiryText(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];

  const chunks = raw
    .split(LINE_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length >= 5);

  if (chunks.length <= 1) {
    const single = parseInquiryLine(raw);
    return single ? [single] : [];
  }

  return chunks.map(parseInquiryLine).filter(Boolean);
}

module.exports = {
  parseInquiryText,
  parseInquiryLine,
  parseQuantity,
  usesNonPieceUnit,
};
