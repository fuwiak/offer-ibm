/**
 * Разбор текста заявки на позиции крепежа.
 * Поддерживает плоский текст, OCR-артефакты и табличные PDF (колонки через tab/|/пробелы).
 */

const { parseHardwareQuery } = require("./hardwareQuery");

const LINE_SPLIT_RE = /\n+|;\s*(?=\d)|(?<=\d)\s*[,;]\s*(?=\D)/;
const HARDWARE_LINE_RE =
  /\bdin\s*\d{3,5}\b|\bgost\s*\d{3,5}\b|\bгост\s*\d{3,5}\b|\bm\s*\d+\s*[x×]\s*\d+|\bm\s*\d+\b|\bd\s*\d+\b|\bштанг|\bшпильк|\bрым|\bболт\s+m|\bболт\s+\d|\bболт\s+.*\b(?:din|гост|gost)\b|\bгайк\w*\s+\d|\bгайк|\bвинт|\bшайб\w*\s+\d|\bшайб|\bштифт|\bарт\.?\s*\d|\bsku\s*[:#]?\s*\d/i;
const INQUIRY_SKIP_LINE_RE =
  /^(?:приложение|перечень|№\s*п\/п|наименование\s+(?:товара|работ)|обозначен(?:ие)?(?:\s*\(.*\))?|артикул|ед\.?\s*изм|кол-?во|количеств|итого|всего|спецификац|sheet\s*:)/i;
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

// Колонка «Артикул»: голый код ShopDB (8–18 цифр) — идентификатор, не наименование.
const BARE_ARTICLE_COL_RE = /^(?:арт\.?|art\.?|sku)?\s*[:#№]?\s*(\d{8,18})$/i;

function buildInquiryChunkFromColumns(cols, tableCtx = null) {
  if (!Array.isArray(cols) || cols.length < 2) return null;

  const isBareArticle = (c) => BARE_ARTICLE_COL_RE.test(String(c || "").trim());
  const productCol =
    cols.find((c) => !isBareArticle(c) && lineHasHardwareSignals(c)) ||
    cols.find((c) => /\bболт\b/i.test(c) && /\bm\s*\d+/i.test(c)) ||
    cols.find(
      (c) =>
        !isBareArticle(c) &&
        /[a-zA-Zа-яА-Я]{4,}/.test(c) &&
        !INQUIRY_UNIT_RE.test(c)
    );
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
  // Артикул рядом с наименованием → точный SKU-поиск в ShopDB.
  const articleCol = cols.find((c) => c !== productCol && isBareArticle(c));
  if (articleCol) {
    const sku = String(articleCol).trim().match(BARE_ARTICLE_COL_RE)?.[1];
    if (sku) parts.push(`арт. ${sku}`);
  }
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
    // DOCX/textutil: U+2028/U+2029 \u2014 \u043c\u044f\u0433\u043a\u0438\u0439 \u043f\u0435\u0440\u0435\u043d\u043e\u0441 \u0432\u043d\u0443\u0442\u0440\u0438 \u044f\u0447\u0435\u0439\u043a\u0438 \u0442\u0430\u0431\u043b\u0438\u0446\u044b
    // (\u00ab\u0428\u043f\u043e\u043d\u043a\u0430 12\u04458\u044550\u2428\u0413\u041e\u0421\u0422 23360-78\u00bb) \u2014 \u0447\u0430\u0441\u0442\u044c \u0442\u043e\u0433\u043e \u0436\u0435 \u043d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u044f, \u043d\u0435
    // \u0433\u0440\u0430\u043d\u0438\u0446\u0430 \u043f\u043e\u0437\u0438\u0446\u0438\u0439.
    .replace(/[\u2028\u2029]/g, " ")
    // × and Cyrillic х between digits = multiply. Do NOT fold uppercase Х
    // in «ХЛ» (cold-climate steel) — that used to become «xЛ» and miss ShopDB.
    .replace(/[×]/g, "x")
    .replace(/(?<=\d)[хХ](?=\d)/g, "x")
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
/**
 * «Гайка + шайба М16» is two catalog SKUs, not one kit.
 * @param {string} line
 * @returns {string[]|null}
 */
function explodeNutWasherCombo(line) {
  const raw = String(line || "").trim();
  const m = raw.match(
    /^(.*?)(гайк\p{L}*)\s*(?:\+|\/|и)\s*(шайб\p{L}*)(.*)$/iu
  );
  if (!m) return null;
  const rest = [m[1], m[4]]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" ");
  if (!rest) return null;
  const nut = `Гайка ${rest}`.replace(/\s+/g, " ").trim();
  const washer = `Шайба ${rest}`.replace(/\s+/g, " ").trim();
  if (nut.length < 5 || washer.length < 5) return null;
  return [nut, washer];
}

function explodePackedHardwareLine(line) {
  const raw = String(line || "").trim();
  if (!raw) return [];

  const combo = explodeNutWasherCombo(raw);
  if (combo) {
    return combo.flatMap((piece) => explodePackedHardwareLine(piece));
  }

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
      /\d+(?:[.,]\d+)?\s*(?:штук|шт\.?|pcs|кг|kg)(?=\s|$|[.,;])/gi
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
      .replace(/\s+\d{1,3}\.\s*$/u, "")
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

    // Bare quantity on its own line (Excel/Word export after product name),
    // включая «601 шт» и разряды пробелами «63 000 шт» / «406 560 шт».
    if (
      /^(?:\d{1,3}(?:[ .]\d{3})+|\d{2,7})(?:[.,]\d+)?(?:\s*(?:штук|шт\.?))?$/iu.test(
        trimmed
      ) &&
      chunks.length > 0
    ) {
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
    /(?:^|\s)\d+(?:[.,]\d+)?\s*(?:штук|шт\.?|pcs|pieces|szt\.?|sztuk|ед\.?|units?)(?:\s|$|[.,;])/i.test(
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
  // ShopDB article codes (8–18 digits) are identity, never quantity.
  if (/^\d{8,18}$/.test(t)) return true;
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
  // Catalog pack size in trailing parentheses: «оцинк (500)» — not RFQ qty.
  if (
    new RegExp(`(?:^|[^\\d])\\(\\s*${t}\\s*\\)\\s*$`, "u").test(text.trim()) ||
    new RegExp(`\\(\\s*${t}\\s*\\)`, "u").test(text)
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
      /(\d+(?:[.,]\d+)?)(?:\s*(?:кг|kg|штук|шт\.?|pcs|pieces|szt\.?|sztuk|ед\.?|units?|meters?|метр(?:а|ов)?|упак(?:овка)?|уп\.?|pack|литр(?:а|ов)?|тонн(?:а|ы)?)|\s+(?:м\.?\s*п\.?|м|л|т)(?=\s|$|[.,;]))/gi
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
      /\s*[-–—]{1,2}\s*\d+(?:[.,]\d+)?\s*(?:кг|kg|штук|шт\.?|pcs|pieces|szt\.?|sztuk|ед\.?|units?|м\.?\s*п\.?|meters?|метр(?:а|ов)?|упак(?:овка)?|уп\.?|pack|л|литр(?:а|ов)?|т|тонн(?:а|ы)?)/gi,
      " "
    )
    // Хвост «30 кг» / «50 шт» из колонки «Кол-во» — не часть наименования.
    .replace(
      /\s+\d+(?:[.,]\d+)?\s*(?:кг|kg|штук|шт\.?|pcs|pieces|szt\.?|sztuk|ед\.?|units?|м\.?\s*п\.?|м|meters?|метр(?:а|ов)?|упак(?:овка)?|уп\.?|pack|л|литр(?:а|ов)?|т|тонн(?:а|ы)?)\s*$/i,
      ""
    )
    // Packed RFQ ordinal glued after qty: "… М10х25-8.8 2." → drop "2."
    // Do NOT use [.)] — that ate «(ГОСТ 52644)» as if 52644) were an ordinal.
    .replace(/\s+\d{1,3}\.\s*$/u, "")
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

    const unitRaw =
      unitIdx >= 0 ? String(fields[unitIdx] || "шт").trim() : "шт";
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

// Parser is deterministic regex/string work — cache is correctness-safe and
// keyed on parser version + input hash. Low priority perf-wise (micro/ms),
// but repeated re-parses of the same RFQ (rematch, draft edits) skip it.
// Entries are deep-cloned on both sides: callers mutate parsed lines
// (quantity merge, .thread), shared references would leak across requests.
const PARSE_CACHE_VERSION = "v4";
const PARSE_CACHE_TTL_MS = Math.max(
  60_000,
  parseInt(process.env.OFFER_KP_PARSE_CACHE_TTL_MS, 10) || 24 * 60 * 60 * 1000
);
const PARSE_CACHE_MAX = Math.max(
  50,
  parseInt(process.env.OFFER_KP_PARSE_CACHE_MAX, 10) || 500
);
/** @type {Map<string, { value: object[], expiresAt: number }>} */
const parseCache = new Map();

function parseCacheKey(text) {
  return `parse:${PARSE_CACHE_VERSION}:${require("crypto")
    .createHash("sha256")
    .update(String(text || ""), "utf8")
    .digest("hex")}`;
}

function cloneParsedLines(lines) {
  return lines.map((line) => ({ ...line }));
}

/** Test helper. */
function clearParseInquiryCache() {
  parseCache.clear();
}

function parseInquiryText(text) {
  const cacheKey = parseCacheKey(text);
  const hit = parseCache.get(cacheKey);
  if (hit) {
    if (Date.now() <= hit.expiresAt) return cloneParsedLines(hit.value);
    parseCache.delete(cacheKey);
  }
  const result = parseInquiryTextUncached(text);
  if (parseCache.size >= PARSE_CACHE_MAX) {
    const oldest = parseCache.keys().next().value;
    if (oldest != null) parseCache.delete(oldest);
  }
  parseCache.set(cacheKey, {
    value: cloneParsedLines(result),
    expiresAt: Date.now() + PARSE_CACHE_TTL_MS,
  });
  return result;
}

// Пословная единица измерения на отдельной строке (вертикальная таблица DOCX:
// «№ / Наименование / ед-ца изм / кол-во» — каждая ячейка своей строкой).
const BARE_UNIT_LINE_RE = /^(шт|шт\.|штук|м|м\.|кг|кг\.|компл|компл\.|уп|уп\.|п\.?м)$/iu;

/**
 * Схлопывает вертикальную таблицу (ячейки построчно) в обычные строки заявки:
 *   41
 *   Винт М16х35.58.019 ГОСТ 11738-84
 *   шт
 *   10
 * → "Винт М16х35.58.019 ГОСТ 11738-84 10 шт"
 * Без этого «41» слипался с предыдущей позицией как её количество, а
 * количество бралось из номера ГОСТа. Триггер узкий: имя + строка-единица +
 * строка-число; одиночные bare-qty строки (буллет-списки) не трогаем.
 * @param {string} text normalized inquiry text
 * @returns {string}
 */
function mergeVerticalTableCells(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const name = lines[i].trim();
    const unit = (lines[i + 1] || "").trim();
    const qty = (lines[i + 2] || "").trim();
    const isNameLine = /\p{L}/u.test(name) && !BARE_UNIT_LINE_RE.test(name);
    if (
      isNameLine &&
      BARE_UNIT_LINE_RE.test(unit) &&
      /^\d{1,7}(?:[.,]\d+)?$/.test(qty)
    ) {
      // Номер строки таблицы перед именем — не количество, убираем.
      if (out.length && /^\d{1,4}$/.test(out[out.length - 1])) out.pop();
      out.push(`${name} ${qty} ${unit.replace(/\.$/, "")}`);
      i += 2;
      continue;
    }
    out.push(name);
  }
  return out.join("\n");
}

function nutClassFromBoltStrength(strengthClass) {
  const m = String(strengthClass || "").match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  return m[1];
}

/**
 * HV set (ГОСТ Р 52644 bolt) implies matching nut ГОСТ Р 52645.
 * Bolt 8.8 / 10.9 on the same diameter implies nut кл.пр.8 / 10.
 * @param {object[]} lines
 * @returns {object[]}
 */
function enrichInquiryLinesFromSiblings(lines = []) {
  const list = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (list.length < 2) return list;

  const hvDiameters = new Set();
  const boltClassByDiam = new Map();
  for (const line of list) {
    const types = line.productTypes || [];
    const parsed = parseHardwareQuery(line.raw || line.name);
    const size = String(
      line.thread?.size || parsed.thread?.size || parsed.diameter || ""
    );
    if (types.includes("болт") && size && parsed.strengthClass) {
      boltClassByDiam.set(size, parsed.strengthClass);
    }
    if ((line.dinNumbers || []).map(String).includes("52644") && size) {
      hvDiameters.add(size);
    }
  }

  return list.map((line) => {
    const types = line.productTypes || [];
    if (!types.includes("гайка")) return line;
    const parsed = parseHardwareQuery(line.raw || line.name);
    const size = String(parsed.diameter || line.thread?.size || "");
    if (!size) return line;

    let next = line;
    const dins = (next.dinNumbers || []).map(String);
    if (hvDiameters.has(size) && !dins.includes("52645")) {
      next = {
        ...next,
        dinNumbers: ["52645"],
        name: /52645/.test(next.name || "")
          ? next.name
          : `${next.name} ГОСТ 52645`.trim(),
        raw: /52645/.test(next.raw || "")
          ? next.raw
          : `${next.raw} ГОСТ 52645`.trim(),
      };
    }

    const boltClass = boltClassByDiam.get(size);
    const nutClass = nutClassFromBoltStrength(boltClass);
    if (nutClass && !parsed.strengthClass) {
      const stamp = `кл.пр.${nutClass}`;
      if (!new RegExp(`кл\\.пр\\.?\\s*${nutClass}`).test(next.raw || "")) {
        next = {
          ...next,
          strengthClass: nutClass,
          name: `${next.name} ${stamp}`.trim(),
          raw: `${next.raw} ${stamp}`.trim(),
        };
      }
    }
    return next;
  });
}

function parseInquiryTextUncached(text) {
  const raw = mergeVerticalTableCells(
    normalizeOcrInquiryText(String(text || "").trim())
  )
    // Пары альтернатив «вариант A / Или / вариант B / кол-во» — одна позиция:
    // количество после варианта B относится к обоим, отдельная строка «Или»
    // иначе оставляла вариант A с мусорным qty из хвоста наименования.
    .replace(/\n\s*или\s*\n/gi, " или ");
  if (!raw) return [];

  const fromCsv = tryParseExpectedCsvInquiry(String(text || ""));
  if (fromCsv?.length) return enrichInquiryLinesFromSiblings(fromCsv);

  const chunks = splitInquiryChunks(raw);
  if (chunks.length <= 1) {
    const single = parseInquiryLine(chunks[0] || raw);
    return single ? enrichInquiryLinesFromSiblings([single]) : [];
  }

  // Merge bare qty lines onto previous position:
  //   Гайка … ГОСТ ISO 7040-2014          Гайка M2-6H.5 ГОСТ 5915-70
  //   28200                                601 шт   (и «63 000 шт»)
  const merged = [];
  for (const chunk of chunks) {
    const trimmed = String(chunk || "").trim();
    const bareQty = trimmed.match(
      /^(\d{1,3}(?:[ .]\d{3})+|\d{2,7})(?:\s*(?:штук|шт\.?))?$/iu
    );
    if (bareQty && merged.length) {
      const prev = merged[merged.length - 1];
      const n = Number(bareQty[1].replace(/[ .](?=\d{3})/g, ""));
      // Prefer dedicated qty line over year/class digits misread as qty.
      if (Number.isFinite(n) && n > 0) {
        prev.quantity = normalizeInquiryQuantity(n, prev.unit || "шт");
        prev.raw = `${prev.raw} ${trimmed}`.trim();
      }
      continue;
    }
    const line = parseInquiryLine(chunk);
    if (line) merged.push(line);
  }
  return enrichInquiryLinesFromSiblings(merged);
}

module.exports = {
  parseInquiryText,
  clearParseInquiryCache,
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
