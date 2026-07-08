/**
 * Разбор текста заявки на позиции крепежа.
 * Поддерживает плоский текст, OCR-артефакты и табличные PDF (колонки через tab/|/пробелы).
 */

const { parseHardwareQuery } = require("./hardwareQuery");

const LINE_SPLIT_RE = /\n+|;\s*(?=\d)|(?<=\d)\s*[,;]\s*(?=\D)/;
const HARDWARE_LINE_RE =
  /\bdin\s*\d{3,5}\b|\bgost\s*\d{3,5}\b|\bгост\s*\d{3,5}\b|\bm\s*\d+\s*[x×]\s*\d+|\bштанг|\bболт\s+m|\bболт\s+.*\b(?:din|гост|gost)\b|\bгайк|\bвинт|\bарт\.?\s*\d|\bsku\s*[:#]?\s*\d/i;
const INQUIRY_SKIP_LINE_RE =
  /^(?:приложение|перечень|№\s*п\/п|наименование\s+товара|ед\.?\s*изм|кол-?во|итого|всего)/i;
const INQUIRY_UNIT_RE = /^(?:кг|kg|шт\.?|pcs|м|м\.|т|упак|ед\.?)$/i;

function lineHasHardwareSignals(text) {
  if (INQUIRY_SKIP_LINE_RE.test(String(text || "").trim())) return false;
  if (HARDWARE_LINE_RE.test(text)) return true;
  const parsed = parseHardwareQuery(text);
  return !!(
    parsed.dinNumbers?.length ||
    parsed.thread ||
    parsed.productTypes?.length
  );
}

function isInquiryMetaLine(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || trimmed.length < 3) return true;
  if (INQUIRY_SKIP_LINE_RE.test(trimmed)) return true;
  if (/^\|?\s*[-:]+(\s*\|?\s*[-:]+)+\s*\|?\s*$/.test(trimmed)) return true;
  const cols = trimmed
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);
  if (
    cols.some((c) => INQUIRY_SKIP_LINE_RE.test(c)) ||
    cols.some((c) => /^наименование\s+товара$/i.test(c))
  ) {
    return true;
  }
  return false;
}

function splitTableColumns(line) {
  return String(line || "")
    .split(/\t|\|/)
    .map((c) => c.trim())
    .filter(Boolean);
}

function buildInquiryChunkFromColumns(cols) {
  if (!Array.isArray(cols) || cols.length < 2) return null;

  const productCol =
    cols.find((c) => lineHasHardwareSignals(c)) ||
    cols.find((c) => /\bболт\b/i.test(c) && /\bm\s*\d+/i.test(c)) ||
    cols.find((c) => /[a-zA-Zа-яА-Я]{4,}/.test(c) && !INQUIRY_UNIT_RE.test(c));
  if (!productCol || isInquiryMetaLine(productCol)) return null;

  const unitCol = cols.find((c) => INQUIRY_UNIT_RE.test(c));
  const qtyCol =
    [...cols]
      .reverse()
      .find((c) => /^\d+(?:[.,]\d+)?$/.test(c)) ||
    cols.find((c) =>
      /^\d+\s*(?:шт\.?|pcs|szt\.?|ед\.?|кг|kg)?$/i.test(c)
    );

  const parts = [productCol.replace(/^\d+[.)]\s*/, "").trim()];
  if (qtyCol) {
    const qty = String(qtyCol).match(/(\d+(?:[.,]\d+)?)/)?.[1];
    if (qty) parts.push(`${qty} ${unitCol || "шт"}`);
  }
  return parts.join(" ").trim();
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
    if (trimmed.length < 5 || isInquiryMetaLine(trimmed)) continue;

    // Markdown / PDF table rows (pipe or tab separated)
    if (/\t|\|/.test(trimmed)) {
      const chunk = buildInquiryChunkFromColumns(splitTableColumns(trimmed));
      if (chunk) {
        pushChunk(chunk);
        continue;
      }
    }

    // Wide-space columns (typical PDF table dumps without pipes)
    if (/\s{3,}/.test(trimmed)) {
      const cols = trimmed
        .split(/\s{2,}/)
        .map((c) => c.trim())
        .filter(Boolean);
      const chunk = buildInquiryChunkFromColumns(cols);
      if (chunk) {
        pushChunk(chunk);
        continue;
      }
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      pushChunk(trimmed);
      continue;
    }

    if (lineHasHardwareSignals(trimmed)) {
      pushChunk(trimmed);
    }
  }

  if (chunks.length) return chunks;

  return normalized
    .split(LINE_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length >= 5);
}

function parseInquiryUnit(text) {
  const raw = String(text || "");
  if (/(?:^|\s)\d+(?:[.,]\d+)?\s*(?:кг|kg)(?:\s|$|[.,;])/i.test(raw)) return "кг";
  if (
    /(?:^|\s)\d+(?:[.,]\d+)?\s*(?:шт\.?|штук|pcs|pieces|szt\.?|sztuk|ед\.?|units?)(?:\s|$|[.,;])/i.test(
      raw
    )
  ) {
    return "шт";
  }
  if (/(?:^|\s)(?:кг|kg)(?:\s|$|[.,;])/i.test(raw)) return "кг";
  if (/(?:^|\s)(?:шт\.?|pcs|ед\.?)(?:\s|$|[.,;])/i.test(raw)) return "шт";
  if (/метр|meter|упак|pack|л\s|литр/i.test(raw)) return "?";
  return "шт";
}

function parseQuantity(text) {
  const raw = String(text || "");
  const withUnit = raw.match(
    /(\d+(?:[.,]\d+)?)\s*(?:кг|kg|шт\.?|штук|pcs|pieces|szt\.?|sztuk|ед\.?|units?)/i
  );
  if (withUnit) {
    const qty = parseFloat(String(withUnit[1]).replace(",", "."));
    return Number.isFinite(qty) ? Math.max(1, Math.round(qty)) : 1;
  }

  const cols = splitTableColumns(raw);
  if (cols.length >= 2) {
    const unitIdx = cols.findIndex((c) => INQUIRY_UNIT_RE.test(c));
    if (unitIdx >= 0) {
      const qtyCol = cols[unitIdx + 1] || cols[cols.length - 1];
      const m = String(qtyCol || "").match(/^(\d+(?:[.,]\d+)?)$/);
      if (m) return Math.max(1, Math.round(parseFloat(m[1].replace(",", "."))));
    }
  }

  const tail = raw.match(/(\d+(?:[.,]\d+)?)\s*$/);
  if (tail) return Math.max(1, Math.round(parseFloat(tail[1].replace(",", "."))));

  const bare = raw.match(/\b(\d{1,6})\b/);
  return bare ? Math.max(1, parseInt(bare[1], 10)) : 1;
}

function usesNonPieceUnit(text) {
  return parseInquiryUnit(text) !== "шт";
}

function parseInquiryLine(lineText) {
  const raw = String(lineText || "").trim();
  if (!raw || raw.length < 3) return null;

  const parsed = parseHardwareQuery(raw);
  const unit = parseInquiryUnit(raw);
  const quantity = parseQuantity(raw);
  const nonPiece = unit !== "шт";

  let name = raw
    .replace(/^\d+[.)]\s*/, "")
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
    unit,
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
  parseInquiryUnit,
  usesNonPieceUnit,
  normalizeOcrInquiryText,
  splitInquiryChunks,
  isInquiryMetaLine,
};
