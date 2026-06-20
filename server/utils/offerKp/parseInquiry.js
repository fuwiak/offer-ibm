/**
 * Разбор текста заявки на позиции крепежа.
 * Поддерживает плоский текст, OCR-артефакты и табличные PDF (колонки через tab/|/пробелы).
 */

const { parseHardwareQuery } = require("./hardwareQuery");

const LINE_SPLIT_RE = /\n+|;\s*(?=\d)|(?<=\d)\s*[,;]\s*(?=\D)/;
const HARDWARE_LINE_RE =
  /\bdin\s*\d{3,5}\b|\bgost\s*\d{3,5}\b|\bm\s*\d+\s*[x×]\s*\d+|\bштанг|\bболт|\bгайк|\bвинт|\bарт\.?\s*\d|\bsku\s*[:#]?\s*\d/i;

function lineHasHardwareSignals(text) {
  if (HARDWARE_LINE_RE.test(text)) return true;
  const parsed = parseHardwareQuery(text);
  return !!(
    parsed.dinNumbers?.length ||
    parsed.thread ||
    parsed.productTypes?.length
  );
}

/**
 * Нормализация типичных OCR-ошибок в заявках на крепёж.
 * @param {string} text
 * @returns {string}
 */
function normalizeOcrInquiryText(text) {
  let t = String(text || "");
  t = t
    .replace(/\u00a0/g, " ")
    .replace(/[×хХ]/g, "x")
    .replace(/[–—−]/g, "-")
    .replace(/\bD\s*I\s*N\s*(\d+)/gi, "DIN $1")
    .replace(/\bG\s*O\s*S\s*T\s*(\d+)/gi, "GOST $1")
    .replace(/\bM\s*(\d+)\s*[x×]\s*(\d+)/gi, "M$1x$2")
    .replace(/(\d)[oO](\d)/g, "$1$2")
    .replace(/(\d)[lI|](\d)/g, "$1$2");

  return t
    .split("\n")
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .join("\n")
    .trim();
}

/**
 * Извлекает строки позиций из табличного/OCR-текста PDF.
 * @param {string} text
 * @returns {string[]}
 */
function splitInquiryChunks(text) {
  const normalized = normalizeOcrInquiryText(text);
  if (!normalized) return [];

  const chunks = [];
  const seen = new Set();

  function pushChunk(raw) {
    const line = String(raw || "").trim();
    if (line.length < 5 || seen.has(line)) return;
    seen.add(line);
    chunks.push(line);
  }

  for (const line of normalized.split(/\n+/)) {
    const trimmed = line.trim();
    if (trimmed.length < 5) continue;

    // Tab / pipe / wide-space columns (typical PDF table dumps)
    if (/\t|\||\s{3,}/.test(trimmed)) {
      const cols = trimmed
        .split(/\t|\||\s{2,}/)
        .map((c) => c.trim())
        .filter(Boolean);
      if (cols.length >= 2) {
        const productCol =
          cols.find((c) => lineHasHardwareSignals(c)) ||
          cols.find((c) => /[a-zA-Zа-яА-Я]{4,}/.test(c)) ||
          cols[0];
        const qtyCol = cols.find((c) =>
          /^\d+\s*(?:шт\.?|pcs|szt\.?|ед\.?)?$/i.test(c)
        );
        const artCol = cols.find((c) =>
          /^(?:арт\.?|art\.?|sku)\s*[:#]?\s*\d+/i.test(c)
        );
        if (productCol) {
          pushChunk(
            [productCol, qtyCol && `${qtyCol} шт`, artCol]
              .filter(Boolean)
              .join(" ")
          );
          continue;
        }
      }
    }

    if (/^\d+[\.)]\s+/.test(trimmed)) {
      pushChunk(trimmed);
      continue;
    }

    if (HARDWARE_LINE_RE.test(trimmed) || lineHasHardwareSignals(trimmed)) {
      pushChunk(trimmed);
    }
  }

  if (chunks.length) return chunks;

  return normalized
    .split(LINE_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length >= 5);
}

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

  const chunks = splitInquiryChunks(raw);
  if (chunks.length <= 1) {
    const single = parseInquiryLine(chunks[0] || raw);
    return single ? [single] : [];
  }

  return chunks.map(parseInquiryLine).filter(Boolean);
}

module.exports = {
  parseInquiryText,
  parseInquiryLine,
  parseQuantity,
  usesNonPieceUnit,
  normalizeOcrInquiryText,
  splitInquiryChunks,
};
