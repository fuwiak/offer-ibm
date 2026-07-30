/**
 * Разбор текста заявки на позиции крепежа.
 * Поддерживает плоский текст, OCR-артефакты и табличные PDF (колонки через tab/|/пробелы).
 */

const { parseHardwareQuery } = require("./hardwareQuery");

const LINE_SPLIT_RE = /\n+|;\s*(?=\d)|(?<=\d)\s*[,;]\s*(?=\D)/;
const HARDWARE_LINE_RE =
  /\bdin\s*\d{3,5}\b|\bgost\s*\d{3,5}\b|\bгост\s*\d{3,5}\b|\bm\s*\d+\s*[x×]\s*\d+|\bm\s*\d+\b|\bd\s*\d+\b|\bштанг|\bшпильк|\bрым|\bболт\s+m|\bболт\s+\d|\bболт\s+.*\b(?:din|гост|gost)\b|\bгайк\w*\s+\d|\bгайк|\bвинт|\bшайб\w*\s+\d|\bшайб|\bштифт|\bарт\.?\s*\d|\bsku\s*[:#]?\s*\d/i;
const INQUIRY_SKIP_LINE_RE =
  /^(?:приложение|перечень|№\s*п\/п|наименование\s+товара|обозначен(?:ие)?(?:\s*\(.*\))?|артикул|ед\.?\s*изм|кол-?во|количеств|итого|всего|спецификац)/i;
const INQUIRY_UNIT_RE =
  /^(?:кг|kg|шт\.?|pcs|szt\.?|м|м\.|м\.?\s*п\.?|meter|meters|т|упак|уп|pack|л|литр|ед\.?)$/i;
const QTY_HEADER_RE = /кол-?во|количеств|qty|ilo[sś]ć/i;
const PRICE_HEADER_RE = /цен|price|cena|сумм|стоимост/i;
const UNIT_HEADER_RE = /ед\.?\s*изм|unit/i;

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

function detectInquiryTableContext(normalized) {
  for (const line of String(normalized || "").split(/\n+/)) {
    if (!/\t|\|/.test(line)) continue;
    const cols = splitTableColumns(line);
    const qtyIdx = cols.findIndex((c) => QTY_HEADER_RE.test(c));
    const priceIdx = cols.findIndex((c) => PRICE_HEADER_RE.test(c));
    const unitIdx = cols.findIndex((c) => UNIT_HEADER_RE.test(c));
    if (qtyIdx >= 0 || unitIdx >= 0) {
      return { qtyIdx, priceIdx, unitIdx };
    }
  }
  return null;
}

function isLikelyPriceToken(token) {
  const s = String(token || "")
    .trim()
    .replace(/\s/g, "");
  if (!s) return false;
  if (/^\d{1,4}(?:[.,]\d{2})$/.test(s)) return true;
  return false;
}

function buildInquiryChunkFromColumns(cols, tableCtx = null) {
  if (!Array.isArray(cols) || cols.length < 2) return null;

  const productCol =
    cols.find((c) => lineHasHardwareSignals(c)) ||
    cols.find((c) => /\bболт\b/i.test(c) && /\bm\s*\d+/i.test(c)) ||
    cols.find((c) => /[a-zA-Zа-яА-Я]{4,}/.test(c) && !INQUIRY_UNIT_RE.test(c));
  if (!productCol || isInquiryMetaLine(productCol)) return null;

  const unitCol =
    (tableCtx?.unitIdx >= 0 && cols[tableCtx.unitIdx]) ||
    cols.find((c) => INQUIRY_UNIT_RE.test(c));
  const inferredUnit = parseInquiryUnit(productCol);
  const quantityUnit = unitCol || (inferredUnit !== "шт" ? inferredUnit : "шт");

  let qtyCol = null;
  if (tableCtx?.qtyIdx >= 0 && cols[tableCtx.qtyIdx]) {
    qtyCol = cols[tableCtx.qtyIdx];
  } else if (unitCol) {
    const unitIdx = cols.indexOf(unitCol);
    const afterUnit = unitIdx >= 0 ? cols[unitIdx + 1] : null;
    if (/^\d+(?:[.,]\d+)?$/.test(String(afterUnit || ""))) {
      qtyCol = afterUnit;
    }
  } else {
    const skip = new Set(
      [tableCtx?.priceIdx, tableCtx?.unitIdx].filter((i) => i >= 0)
    );
    for (let i = cols.length - 1; i >= 0; i--) {
      if (skip.has(i)) continue;
      const c = cols[i];
      if (/^\d+(?:[.,]\d+)?$/.test(c) && !isLikelyPriceToken(c)) {
        qtyCol = c;
        break;
      }
    }
  }

  const parts = [productCol.replace(/^\d+[.)]\s*/, "").trim()];
  if (qtyCol) {
    const qty = String(qtyCol).match(/(\d+(?:[.,]\d+)?)/)?.[1];
    if (qty && (!isLikelyPriceToken(qty) || unitCol || tableCtx?.qtyIdx >= 0)) {
      parts.push(`${qty} ${quantityUnit}`);
    } else if (
      QTY_HEADER_RE.test(qtyCol) ||
      /обозначен|артикул|наименован/i.test(productCol)
    ) {
      // Строка заголовка таблицы («Обозначение… | Количество»), не позиция.
      return null;
    }
  }
  return parts.join(" ").trim();
}

/**
 * Strip Telegram / WhatsApp / chat-export chrome:
 *   "[28/07/2026 16:08] Игорь Бобик: Болт DIN 933..."
 * Keep the product text after the speaker prefix.
 */
const MESSENGER_HEADER_RE =
  /^\s*(?:\[\s*)?\d{1,2}[/./-]\d{1,2}[/./-]\d{2,4}(?:[,\s]+|\s+)\d{1,2}:\d{2}(?::\d{2})?\s*\]?\s*[-–—]?\s*[^:\n]{1,80}:\s*/u;

const MESSENGER_ONLY_CHAT_RE =
  /^(?:вот\s+например\s+список|это\s+прямо\s+наши\s+наименования|попробуйте\s+кп|сформир\w*\s+кп)\b/i;

/**
 * @param {string} text
 * @returns {string}
 */
function stripMessengerExportNoise(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => {
      let t = String(line || "").trim();
      if (!t) return "";
      t = t.replace(MESSENGER_HEADER_RE, "").trim();
      if (!t) return "";
      if (MESSENGER_ONLY_CHAT_RE.test(t) && !HARDWARE_LINE_RE.test(t)) {
        return "";
      }
      return t;
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * Нормализация типичных OCR-ошибок в заявках на крепёж.
 * @param {string} text
 * @returns {string}
 */
function normalizeOcrInquiryText(text) {
  let t = stripMessengerExportNoise(text);
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
 * Explode a packed RFQ line that lists many products inline:
 * "Шайба 24 DIN 127 1шт Шпилька М24… 1шт Штифт 14х32…"
 * → separate chunks per product type.
 * @param {string} line
 * @returns {string[]}
 */
function explodePackedHardwareLine(line) {
  const raw = String(line || "").trim();
  if (!raw) return [];

  // Strip leading politeness / supply-request preface before first product.
  // Avoid \\b — JS word boundaries are ASCII-only and break on Cyrillic.
  const prefaceStripped = raw
    .replace(
      /^[\s\S]{0,160}?(?=(?:^|[^\p{L}\p{N}])(?:гайк|шайб|шпильк|штифт|рым|болт|винт|анкер|саморез))/iu,
      ""
    )
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
  const working = prefaceStripped || raw;

  // Рым-болт: keep the compound token (avoid splitting as bare «болт»).
  const typeHits = [
    ...working.matchAll(
      /(?:^|[^\p{L}\p{N}])(?=(рым[-\s]?болт\w*|гайк\w*|шайб\w*|шпильк\w*|штифт\w*|(?<!рым[-\s])болт\w*|винт\w*|анкер\w*))/giu
    ),
  ];
  // Adjust match index to the product token itself (after the separator).
  const starts = typeHits
    .map((hit) => {
      const sep = hit[0];
      const idx = hit.index ?? 0;
      return sep &&
        sep.length &&
        !/^(гайк|шайб|шпильк|штифт|рым|болт|винт|анкер)/iu.test(sep)
        ? idx + sep.length
        : idx;
    })
    .filter((n) => Number.isFinite(n));

  const qtyHits = [
    ...working.matchAll(
      /\d+(?:[.,]\d+)?\s*(?:шт\.?|штук|pcs|кг|kg)(?=\s|$|[.,;])/gi
    ),
  ];
  // Require multiple quantities — otherwise "Болт … с гайкой 30 кг" would
  // falsely split on the accessory «гайкой».
  if (starts.length < 2 || qtyHits.length < 2) {
    return [prefaceStripped && prefaceStripped !== raw ? working : raw];
  }

  const uniqStarts = [...new Set(starts)].sort((a, b) => a - b);
  if (uniqStarts.length < 2) {
    return [working];
  }

  const parts = [];
  for (let i = 0; i < uniqStarts.length; i++) {
    const from = uniqStarts[i];
    const to = i + 1 < uniqStarts.length ? uniqStarts[i + 1] : working.length;
    // "… 1700 шт. 2.Винт …" → first chunk must not keep the next ordinal "2."
    let chunk = working
      .slice(from, to)
      .replace(/\s*\d+[.)]\s*$/u, "")
      .replace(/^\d+[.)]\s*/u, "")
      .trim();
    if (chunk.length >= 5) parts.push(chunk);
  }
  return parts.length ? parts : [working];
}

/**
 * Извлекает строки позиций из табличного/OCR-текста PDF.
 * @param {string} text
 * @returns {string[]}
 */
function splitInquiryChunks(text) {
  const normalized = normalizeOcrInquiryText(text);
  if (!normalized) return [];

  const tableCtx = detectInquiryTableContext(normalized);
  const chunks = [];

  function pushChunk(raw) {
    for (const piece of explodePackedHardwareLine(raw)) {
      const line = String(piece || "").trim();
      if (line.length < 5) continue;
      chunks.push(line);
    }
  }

  for (const line of normalized.split(/\n+/)) {
    const trimmed = line.trim();
    if (trimmed.length < 5 || isInquiryMetaLine(trimmed)) continue;

    if (/\t|\|/.test(trimmed)) {
      const chunk = buildInquiryChunkFromColumns(
        splitTableColumns(trimmed),
        tableCtx
      );
      if (chunk) {
        pushChunk(chunk);
        continue;
      }
    }

    if (/\s{3,}/.test(trimmed)) {
      const cols = trimmed
        .split(/\s{2,}/)
        .map((c) => c.trim())
        .filter(Boolean);
      const chunk = buildInquiryChunkFromColumns(cols, tableCtx);
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
      continue;
    }

    // Bare quantity on its own line (Excel/Word export after product name).
    if (/^\d{2,7}(?:[.,]\d+)?$/.test(trimmed) && chunks.length > 0) {
      chunks.push(trimmed);
    }
  }

  if (chunks.length) return chunks;

  return normalized
    .split(LINE_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length >= 5)
    .flatMap((s) => explodePackedHardwareLine(s));
}

function parseInquiryUnit(text) {
  const raw = String(text || "");
  if (/(?:^|\s)\d+(?:[.,]\d+)?\s*(?:кг|kg)(?:\s|$|[.,;])/i.test(raw))
    return "кг";
  if (
    /(?:^|\s)\d+(?:[.,]\d+)?\s*(?:шт\.?|штук|pcs|pieces|szt\.?|sztuk|ед\.?|units?)(?:\s|$|[.,;])/i.test(
      raw
    )
  ) {
    return "шт";
  }
  if (/(?:^|\s)(?:кг|kg)(?:\s|$|[.,;])/i.test(raw)) return "кг";
  if (/(?:^|\s)(?:шт\.?|pcs|ед\.?)(?:\s|$|[.,;])/i.test(raw)) return "шт";
  if (
    /(?:^|\s)(?:м\.?\s*п\.?|м|meter|meters|метр(?:а|ов)?)(?:\s|$|[.,;])/i.test(
      raw
    )
  )
    return "м";
  if (/(?:^|\s)(?:упак(?:овка)?|уп\.?|pack)(?:\s|$|[.,;])/i.test(raw))
    return "уп";
  if (/(?:^|\s)(?:л|литр(?:а|ов)?)(?:\s|$|[.,;])/i.test(raw)) return "л";
  if (/(?:^|\s)(?:т|тонн(?:а|ы)?)(?:\s|$|[.,;])/i.test(raw)) return "т";
  return "шт";
}

function normalizeInquiryQuantity(value, unit) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return 1;
  if (unit === "шт") return Math.max(1, Math.round(quantity));
  return Number(quantity.toFixed(3));
}

function isStructuralCatalogNumber(token, raw) {
  const t = String(token || "").trim();
  const text = String(raw || "");
  if (!t || !text) return false;
  // DIN / ГОСТ / ISO / ИСО code — never a quantity.
  if (
    new RegExp(
      `(?:^|[^\\p{L}\\p{N}])(?:din|гост|gost|iso|исо)\\s*[-№]?\\s*${t}(?:$|[^\\p{L}\\p{N}])`,
      "iu"
    ).test(text)
  ) {
    return true;
  }
  // Year suffix on standard: ISO 7040-2014 / ГОСТ 24296-93.
  if (
    /^\d{4}$/.test(t) &&
    new RegExp(
      `(?:din|гост|gost|iso|исо)\\s*\\d{3,5}\\s*[-–—]\\s*${t}\\b`,
      "iu"
    ).test(text)
  ) {
    return true;
  }
  // Nut/bolt size class: М24-5 / М16-8 — diameter before dash is not qty.
  if (
    new RegExp(`(?:^|[^\\p{L}\\p{N}])[mм]\\s*${t}\\s*[-–—]\\s*\\d`, "iu").test(
      text
    )
  ) {
    return true;
  }
  // Nut property class / strength tail: М24-5, М16-8-АЗР (not quantity).
  if (
    new RegExp(
      `(?:^|[^\\p{L}\\p{N}])[mм]\\s*\\d+(?:[.,]\\d+)?\\s*[-–—]\\s*${t}(?:$|[^\\p{L}\\p{N}])`,
      "iu"
    ).test(text)
  ) {
    return true;
  }
  // Thread diameter or length in MxL / DxL (Latin/Cyrillic M and x).
  if (
    new RegExp(`(?:^|[^\\p{L}\\p{N}])[mм]\\s*${t}\\s*[xх×]`, "iu").test(text) ||
    new RegExp(`[xх×]\\s*${t}(?:$|[^\\p{L}\\p{N}])`, "iu").test(text) ||
    new RegExp(`(?:^|[^\\p{L}\\p{N}])${t}\\s*[xх×]\\s*\\d`, "iu").test(text)
  ) {
    return true;
  }
  return false;
}

function parseQuantity(text) {
  const raw = String(text || "");
  const unit = parseInquiryUnit(raw);
  const withUnit = [
    ...raw.matchAll(
      /(\d+(?:[.,]\d+)?)(?:\s*(?:кг|kg|шт\.?|штук|pcs|pieces|szt\.?|sztuk|ед\.?|units?|meters?|метр(?:а|ов)?|упак(?:овка)?|уп\.?|pack|литр(?:а|ов)?|тонн(?:а|ы)?)|\s+(?:м\.?\s*п\.?|м|л|т)(?=\s|$|[.,;]))/gi
    ),
  ].at(-1);
  if (withUnit) {
    const qtyStr = withUnit[1];
    const qty = parseFloat(String(qtyStr).replace(",", "."));
    // Explicit unit (10 кг / 200 шт) wins over DIN/MxL digit collision.
    return normalizeInquiryQuantity(qty, unit);
  }

  const cols = splitTableColumns(raw);
  if (cols.length >= 2) {
    const unitIdx = cols.findIndex((c) => INQUIRY_UNIT_RE.test(c));
    if (unitIdx >= 0) {
      const qtyCol = cols[unitIdx + 1] || cols[cols.length - 1];
      const m = String(qtyCol || "").match(/^(\d+(?:[.,]\d+)?)$/);
      if (m && (unit !== "шт" || !isLikelyPriceToken(m[1]))) {
        return normalizeInquiryQuantity(
          parseFloat(m[1].replace(",", ".")),
          unit
        );
      }
    }
  }

  // Never treat DIN/GOST/thread digits as quantity. If nothing else remains,
  // default to 1 (catalog compare / underspecified RFQ lines).
  const numbers = [...raw.matchAll(/\b(\d+(?:[.,]\d+)?)\b/g)].map((m) => m[1]);
  for (let i = numbers.length - 1; i >= 0; i--) {
    const token = numbers[i];
    if (isLikelyPriceToken(token)) continue;
    if (isStructuralCatalogNumber(token, raw)) continue;
    const n = parseFloat(token.replace(",", "."));
    if (Number.isFinite(n) && n > 0) {
      return normalizeInquiryQuantity(n, unit);
    }
  }

  return 1;
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
    // Quantity may occur before the specification (`--10шт DIN 912 M8x14`).
    // Remove only the quantity token; never discard the specification tail.
    .replace(
      /\s*[-–—]{1,2}\s*\d+(?:[.,]\d+)?\s*(?:кг|kg|шт\.?|штук|pcs|pieces|szt\.?|sztuk|ед\.?|units?|м\.?\s*п\.?|meters?|метр(?:а|ов)?|упак(?:овка)?|уп\.?|pack|л|литр(?:а|ов)?|т|тонн(?:а|ы)?)/gi,
      " "
    )
    // Хвост «30 кг» / «50 шт» из колонки «Кол-во» — не часть наименования.
    .replace(
      /\s+\d+(?:[.,]\d+)?\s*(?:кг|kg|шт\.?|штук|pcs|pieces|szt\.?|sztuk|ед\.?|units?|м\.?\s*п\.?|м|meters?|метр(?:а|ов)?|упак(?:овка)?|уп\.?|pack|л|литр(?:а|ов)?|т|тонн(?:а|ы)?)\s*$/i,
      ""
    )
    // Packed RFQ ordinal glued after qty: "… М10х25-8.8 2." → drop "2."
    .replace(/\s+\d+[.)]\s*$/u, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+[-–—]+\s*$/, "")
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

/** Minimal CSV field split (quoted commas OK). Curly quotes normalized first. */
function splitCsvFields(line) {
  const raw = String(line || "")
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'");
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"' && raw[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

/**
 * Paste of test_files/*.expected.csv (or the same rows jammed on one line).
 * Returns inquiry lines from source_name/unit/quantity; null if not that schema.
 */
function tryParseExpectedCsvInquiry(text) {
  let raw = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
  if (!raw || !/source_name/i.test(raw)) return null;

  // Drop leading chat noise ("-8B", "L-8B", "сделай кп") before the CSV header.
  const headerAt = raw.search(/(?:^|[\s,;])nr\s*,\s*source_name\s*,/i);
  if (headerAt >= 0) {
    const start = raw.slice(headerAt).search(/nr\s*,\s*source_name\s*,/i);
    if (start >= 0) raw = raw.slice(headerAt + start);
  }

  // One-line / chat paste: header and rows jammed with spaces.
  // Only split on row boundaries (after match_type / before next nr) —
  // never on "qty,SKU," which also looks like digit-comma-quote.
  if (!/\n/.test(raw) || raw.split(/\n/).filter(Boolean).length < 3) {
    raw = raw
      .replace(/(match_type)\s+(?=\d+\s*,)/i, "$1\n")
      .replace(/\b(exact|analog|none)\s+(?=\d+\s*,)/gi, "$1\n");
  }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const header = splitCsvFields(lines[0]).map((h) => h.trim().toLowerCase());
  const sourceIdx = header.indexOf("source_name");
  const qtyIdx = header.indexOf("quantity");
  const unitIdx = header.indexOf("unit");
  const skuIdx = header.indexOf("matched_sku");
  if (sourceIdx < 0) return null;

  const out = [];
  for (const line of lines.slice(1)) {
    if (/^nr\s*,\s*source_name/i.test(line)) continue;
    const fields = splitCsvFields(line);
    if (fields.length <= sourceIdx) continue;
    const sourceName = String(fields[sourceIdx] || "").trim();
    if (!sourceName || sourceName.length < 3) continue;
    if (/^source_name$/i.test(sourceName)) continue;

    const unitRaw = unitIdx >= 0 ? String(fields[unitIdx] || "шт").trim() : "шт";
    const unit = /кг|kg/i.test(unitRaw)
      ? "кг"
      : /уп|pack/i.test(unitRaw)
        ? "уп"
        : "шт";
    const qtyRaw = qtyIdx >= 0 ? String(fields[qtyIdx] || "").trim() : "";
    const quantity = normalizeInquiryQuantity(
      Number(String(qtyRaw).replace(",", ".")),
      unit
    );
    const sku =
      skuIdx >= 0 ? String(fields[skuIdx] || "").trim() || null : null;

    const parsed = parseHardwareQuery(sourceName);
    out.push({
      raw: quantity > 1 ? `${sourceName} – ${quantity} ${unit}` : sourceName,
      name: sourceName,
      dinNumbers: parsed.dinNumbers,
      thread: parsed.thread,
      dimensions: parsed.dimensions,
      strengthClass: parsed.strengthClass,
      coating: parsed.coating,
      productTypes: parsed.productTypes,
      quantity,
      unit,
      sku,
      matchTypeHint:
        header.indexOf("match_type") >= 0
          ? String(fields[header.indexOf("match_type")] || "")
              .trim()
              .toLowerCase() || null
          : null,
      specialRequirements: "",
      needsReview: unit !== "шт",
    });
  }
  return out.length ? out : null;
}

function parseInquiryText(text) {
  const raw = normalizeOcrInquiryText(String(text || "").trim());
  if (!raw) return [];

  const fromCsv = tryParseExpectedCsvInquiry(String(text || ""));
  if (fromCsv?.length) return fromCsv;

  const chunks = splitInquiryChunks(raw);
  if (chunks.length <= 1) {
    const single = parseInquiryLine(chunks[0] || raw);
    return single ? [single] : [];
  }

  // Merge bare qty lines onto previous position:
  //   Гайка … ГОСТ ISO 7040-2014
  //   28200
  const merged = [];
  for (const chunk of chunks) {
    const bareQty = String(chunk || "")
      .trim()
      .match(/^(\d{2,7})$/);
    if (bareQty && merged.length) {
      const prev = merged[merged.length - 1];
      const n = Number(bareQty[1]);
      // Prefer dedicated qty line over year/class digits misread as qty.
      if (Number.isFinite(n) && n > 0) {
        prev.quantity = normalizeInquiryQuantity(n, prev.unit || "шт");
        prev.raw = `${prev.raw} ${bareQty[1]}`.trim();
      }
      continue;
    }
    const line = parseInquiryLine(chunk);
    if (line) merged.push(line);
  }
  return merged;
}

module.exports = {
  parseInquiryText,
  parseInquiryLine,
  parseQuantity,
  parseInquiryUnit,
  normalizeInquiryQuantity,
  usesNonPieceUnit,
  normalizeOcrInquiryText,
  stripMessengerExportNoise,
  explodePackedHardwareLine,
  splitInquiryChunks,
  isInquiryMetaLine,
  tryParseExpectedCsvInquiry,
};
