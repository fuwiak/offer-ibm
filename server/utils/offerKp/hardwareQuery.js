/**
 * NLP / regex разбор запросов к каталогу крепежа и металлопроката.
 */

const {
  foldHomoglyphs,
  normalizeSearchText,
  expandSearchTerms,
} = require("./textNormalize");

const STOPWORDS = new Set([
  "какой",
  "какая",
  "какие",
  "какое",
  "как",
  "что",
  "где",
  "когда",
  "сколько",
  "нужен",
  "нужна",
  "нужно",
  "нужны",
  "есть",
  "ли",
  "или",
  "для",
  "при",
  "под",
  "над",
  "это",
  "этот",
  "эта",
  "эти",
  "меня",
  "мне",
  "вас",
  "вам",
  "цена",
  "цену",
  "стоимость",
  "купить",
  "заказать",
  "подскажите",
  "скажите",
  "пожалуйста",
  "коммерческое",
  "предложение",
  "кп",
  "арт",
]);

const PRICE_ONLY_RE =
  /^(jaka\s+)?cena\??$|ile\s+kosztuje|сколько\s+стоит|какая\s+цена|what('s|\s+is)\s+the\s+price/i;

/** Ключевые слова типа изделия (корни для поиска в названии). */
const PRODUCT_TYPE_ROOTS = {
  штанга: ["штанг", "sztyc", "stud"],
  шпилька: ["шпильк", "stud bolt", "threaded rod"],
  болт: ["болт", "bolt"],
  "рым-болт": ["рым", "eye bolt", "eyebolt"],
  гайка: ["гайк", "nut"],
  винт: ["винт", "screw"],
  штифт: ["штифт", "pin"],
  шайба: ["шайб", "washer"],
  анкер: ["анкер", "anchor"],
  шпоночная: ["шпоночн", "шпонк", "keyway", "key steel"],
  сталь: ["сталь", "steel"],
  полоса: ["полос", "strip", "flat bar"],
  квадрат: ["квадрат", "square"],
  круг: ["круг", "round", "bar", "rod"],
};

/**
 * Клиенты часто путают «винт»/«болт» в тексте заявки (разговорная речь),
 * а каталог называет товар строго по номенклатуре стандарта. Без этой
 * добавки structured-поиск (AND по productTypes) отбрасывал верный товар
 * только потому, что клиент написал «винт» про DIN 933 — это болт, не винт
 * (см. AUDYT.md §8, реальный пример на golden set). Тип добавляется, а не
 * заменяет то, что написал клиент — обе версии остаются в OR-условии.
 */
const STANDARD_IMPLIES_TYPE = {
  "933": "болт",
  "931": "болт",
  "7805": "болт",
  "7798": "болт",
  "912": "винт",
  "11738": "винт",
  "934": "гайка",
  "5915": "гайка",
  "433": "шайба",
  "10450": "шайба",
  "125": "шайба",
  "11371": "шайба",
  "7985": "винт",
  "17473": "винт",
  "11871": "гайка",
  "11872": "шайба",
  "975": "шпилька",
  "6325": "штифт",
  "7": "штифт",
  "1": "штифт",
  "7978": "штифт",
  "9464": "штифт",
  "3129": "штифт",
  "127": "шайба",
  "580": "рым-болт",
  "4751": "рым-болт",
  "8918": "гайка",
};

function normalizeForMatch(text) {
  // Fine pitch first (M50x1,5 / M50x1.5), then integer MxL — otherwise
  // "M 50x1,5" collapses to "m50x1" and the pitch fraction is lost.
  // Negative lookahead: do not re-match "m50x1" inside already-normalized "m50x1.5".
  return foldHomoglyphs(
    normalizeSearchText(text)
      .replace(/\bm\s*(\d+)\s*x\s*(\d+)[.,](\d+)/gi, " m$1x$2.$3 ")
      .replace(/\bm\s*(\d+)\s*x\s*(\d+)(?!\.\d)/gi, " m$1x$2 ")
  );
}

/**
 * Decide whether MxN is diameter×length or diameter×pitch.
 * Nuts: almost always pitch. Decimal second value: always pitch.
 * Small second vs large diameter (M24x2, M10x1): pitch.
 */
function classifyMetricPair(sizeStr, secondStr, productTypes = []) {
  const size = Number(sizeStr);
  const second = Number(String(secondStr).replace(",", "."));
  const isNut = productTypes.includes("гайка");
  const isWasher = productTypes.includes("шайба");
  const hasDecimal = /[.,]/.test(String(secondStr));

  // Fine pitch: M50x1,5 / M10x1.25 / M8x1 (second typically ≤ 6).
  if (
    hasDecimal ||
    (isNut && second <= 6) ||
    (!isNut && !isWasher && size >= 8 && second <= 6 && second < size / 3)
  ) {
    return {
      kind: "pitch",
      size: sizeStr,
      pitch: String(secondStr).replace(",", "."),
    };
  }
  // Washers rarely use MxL; keep diameter only.
  if (isWasher) {
    return { kind: "diameter", size: sizeStr };
  }
  return { kind: "thread", size: sizeStr, length: String(Math.trunc(second)) };
}

function parseMetricSpecs(normalized, productTypes = []) {
  let thread = null;
  let pitch = null;
  let diameter = null;

  // Decimal diameter first: M2,5x8 / M1.6x6 (RFQ often uses comma).
  const decimalThread = normalized.match(
    /\bm\s*(\d+[.,]\d+)\s*x\s*(\d+(?:[.,]\d+)?)\b/i
  );
  if (decimalThread) {
    diameter = decimalThread[1].replace(",", ".");
    thread = {
      size: diameter,
      length: String(decimalThread[2]).replace(",", "."),
    };
  } else {
    const pitchDec = normalized.match(/\bm\s*(\d+)\s*x\s*(\d+\.\d+)\b/i);
    if (pitchDec) {
      diameter = pitchDec[1];
      pitch = pitchDec[2];
    } else {
      const pair = normalized.match(/\bm\s*(\d+)\s*x\s*(\d+)\b/i);
      if (pair) {
        const classified = classifyMetricPair(pair[1], pair[2], productTypes);
        diameter = classified.size;
        if (classified.kind === "thread") {
          thread = { size: classified.size, length: classified.length };
        } else if (classified.kind === "pitch") {
          pitch = classified.pitch;
        }
      }
    }
  }

  if (!diameter) {
    const mDec = normalized.match(/\bm\s*(\d+[.,]\d+)\b/i);
    if (mDec) diameter = mDec[1].replace(",", ".");
  }
  if (!diameter) {
    const mOnly = normalized.match(/\bm\s*(\d+)\b/i);
    if (mOnly) diameter = mOnly[1];
  }
  if (!diameter) {
    const dForm = normalized.match(/\bd\s*(\d+(?:\.\d+)?)\b/i);
    if (dForm) diameter = dForm[1].replace(",", ".");
  }

  return { thread, pitch, diameter };
}

function parseHardwareQuery(message) {
  const raw = String(message || "");
  const lower = raw.toLowerCase();
  const normalized = normalizeForMatch(raw);

  const dinNumbers = [];
  const pushStd = (n) => {
    const v = String(n || "").trim();
    if (v && !dinNumbers.includes(v)) dinNumbers.push(v);
  };
  for (const m of raw.matchAll(/\bdin\s*[- ]?\s*(\d{1,5})\b/gi)) {
    pushStd(m[1]);
  }
  // ГОСТ 7805 / ГОСТ Р 7805 — but not «ГОСТ Р ИСО 1207» (handled below).
  for (const m of raw.matchAll(
    /(?:gost|гост)\s*(?:р(?:ф)?\s+)?(?!исо\b|iso\b)[- ]?\s*(\d{4,5})/gi
  )) {
    pushStd(m[1]);
  }
  // ISO / ИСО / ГОСТ Р ИСО / ГОСТ ISO — RFQ often has only ISO, no DIN.
  for (const m of raw.matchAll(
    /(?:(?:gost|гост)\s*(?:р(?:ф)?\s*)?)?(?:исо|iso)\s*[- ]?\s*(\d{3,5})\b/gi
  )) {
    pushStd(m[1]);
  }
  // Glued form: ИСО 10642-M5x16 / ISO7045
  for (const m of raw.matchAll(/(?:исо|iso)\s*[- ]?\s*(\d{3,5})\s*[-–—]/gi)) {
    pushStd(m[1]);
  }
  for (const m of raw.matchAll(/\b(\d{4,5})\s*[-–]\s*\d{2}\b/g)) {
    pushStd(m[1]);
  }

  let dimensions = null;
  const dimMatch =
    normalized.match(/\b(\d+)\s*x\s*(\d+)\s*x\s*(\d+)\b/i) ||
    normalized.match(/\b(\d+)\s*x\s*(\d+)\b/i);
  if (dimMatch && !normalized.match(/\bm\s*\d+\s*x\s*\d+/i)) {
    dimensions = {
      a: dimMatch[1],
      b: dimMatch[2],
      c: dimMatch[3] || null,
    };
  }

  const productTypes = [];
  for (const [type, roots] of Object.entries(PRODUCT_TYPE_ROOTS)) {
    if (
      roots.some((r) => {
        // Avoid false «круг» inside «скругленной головкой».
        if (r === "круг") {
          return /(?:^|[^\p{L}])круг(?:[^\p{L}]|$)/iu.test(lower);
        }
        return lower.includes(r);
      })
    ) {
      productTypes.push(type);
    }
  }
  // Only fill in the DIN-implied type when the customer named no product
  // type at all ("DIN 933 M10x80" with nothing else) — that's an aid to
  // search recall with zero downstream risk. Union-ing it in on TOP of an
  // explicitly stated type (metamorphic test caught this: "гайка DIN 933
  // M10x80" against a real DIN 933 bolt) let requestedSpecsMatch/
  // productTypeMatches pass on an "OR" basis, so a customer asking for a nut
  // could get quoted a bolt as an "exact" match — a wrong-category result is
  // worse than the narrower recall this was meant to fix.
  if (!productTypes.length) {
    for (const num of dinNumbers) {
      const impliedType = STANDARD_IMPLIES_TYPE[num];
      if (impliedType && !productTypes.includes(impliedType)) {
        productTypes.push(impliedType);
      }
    }
  }

  const { thread, pitch, diameter } = parseMetricSpecs(
    normalized,
    productTypes
  );

  let strengthClass = null;
  const strengthMatch = lower.match(/\b(\d+\.\d+)\b/);
  if (strengthMatch) strengthClass = strengthMatch[1];

  const coating = /оцинк|ocynk|\bzn\b|цинк/i.test(lower) ? "оцинк" : null;

  return {
    dinNumbers,
    thread,
    pitch,
    diameter,
    dimensions,
    strengthClass,
    coating,
    productTypes,
    normalized,
  };
}

function extractSearchTerms(message) {
  const parsed = parseHardwareQuery(message);
  const words = String(message || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s./-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  const phrases = [];
  for (const din of parsed.dinNumbers) {
    phrases.push(`din ${din}`);
    phrases.push(din);
  }
  if (parsed.thread) {
    phrases.push(`m ${parsed.thread.size}x${parsed.thread.length}`);
    phrases.push(`m${parsed.thread.size}x${parsed.thread.length}`);
  } else if (parsed.diameter) {
    phrases.push(`m ${parsed.diameter}`);
    phrases.push(`m${parsed.diameter}`);
    if (parsed.pitch) {
      phrases.push(`m${parsed.diameter}x${parsed.pitch}`);
      phrases.push(`m ${parsed.diameter}x${parsed.pitch}`);
    }
  }
  if (parsed.dimensions) {
    const { a, b, c } = parsed.dimensions;
    phrases.push(`${a}x${b}`);
    if (c) phrases.push(`${a}x${b}x${c}`);
  }
  for (const type of parsed.productTypes) {
    const roots = PRODUCT_TYPE_ROOTS[type] || [type];
    phrases.push(roots[0]);
  }

  const seen = new Set();
  const unique = [];
  for (const w of [...phrases, ...words]) {
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(w);
  }
  unique.sort((a, b) => b.length - a.length);
  return expandSearchTerms(unique.slice(0, 8), 16);
}

function nameMatchesThread(nameNorm, thread) {
  if (!thread) return false;
  const re = new RegExp(`m\\s*${thread.size}\\s*x\\s*${thread.length}\\b`, "i");
  return re.test(nameNorm);
}

function nameMatchesDin(nameNorm, dinNumbers) {
  if (!dinNumbers.length) return false;
  return dinNumbers.some(
    (d) =>
      nameNorm.includes(`din ${d}`) ||
      nameNorm.includes(`din${d}`) ||
      nameNorm.includes(`gost ${d}`) ||
      nameNorm.includes(`gost${d}`) ||
      nameNorm.includes(d) ||
      new RegExp(`\\bdin\\s*[- ]?\\s*${d}\\b`).test(nameNorm)
  );
}

function scoreProduct(product, parsed, terms) {
  const nameNorm = normalizeForMatch(product.name || "");
  const hay = `${nameNorm} ${normalizeForMatch(product.summary || "")}`;
  let score = 0;

  if (parsed.dinNumbers.length) {
    if (nameMatchesDin(nameNorm, parsed.dinNumbers)) score += 80;
    else score -= 50;
  }

  if (parsed.productTypes.length) {
    let typeHit = false;
    for (const type of parsed.productTypes) {
      const roots = PRODUCT_TYPE_ROOTS[type] || [];
      if (roots.some((r) => hay.includes(r))) {
        typeHit = true;
        score += 40;
      }
    }
    if (!typeHit) {
      for (const [type, roots] of Object.entries(PRODUCT_TYPE_ROOTS)) {
        if (parsed.productTypes.includes(type)) continue;
        if (roots.some((r) => nameNorm.includes(r))) score -= 35;
      }
    }
  }

  if (parsed.thread) {
    if (nameMatchesThread(nameNorm, parsed.thread)) score += 50;
    else if (nameNorm.includes(`m ${parsed.thread.size}`)) score += 15;
    else score -= 20;
  } else if (parsed.diameter) {
    const diamRe = new RegExp(
      `(?:\\bm\\s*${parsed.diameter}(?![0-9])|\\bd\\s*${parsed.diameter}(?![0-9]))`,
      "i"
    );
    if (diamRe.test(nameNorm)) score += 40;
    else score -= 15;
    if (parsed.pitch) {
      const pitchEsc = String(parsed.pitch).replace(".", "[.,]");
      const pitchRe = new RegExp(
        `\\bm\\s*${parsed.diameter}\\s*x\\s*${pitchEsc}\\b`,
        "i"
      );
      if (pitchRe.test(nameNorm)) score += 25;
    }
  }

  if (parsed.dimensions) {
    const { a, b, c } = parsed.dimensions;
    const dimHay = hay.replace(/\s/g, "");
    const dimPatterns = [c ? `${a}x${b}x${c}` : null, `${a}x${b}`].filter(
      Boolean
    );
    if (dimPatterns.some((p) => dimHay.includes(p))) score += 45;
    else if (dimHay.includes(a) && dimHay.includes(b)) score += 12;
    else score -= 15;
  }

  if (parsed.strengthClass && hay.includes(parsed.strengthClass)) score += 15;

  if (parsed.coating && /оцинк|zn|цинк/.test(hay)) score += 10;

  for (const t of terms) {
    const tl = t.toLowerCase();
    if (tl.length < 4 && tl !== "975") continue;
    if (tl === "din") continue;
    if (hay.includes(normalizeForMatch(t))) score += 5;
  }

  score += (product.shopMatchSources?.length || 0) * 2;
  score += Math.min(Number(product.total_sales) || 0, 5) * 0.1;

  return score;
}

function rankProducts(products, terms, parsed) {
  const scored = products.map((p, index) => ({
    p,
    score: scoreProduct(p, parsed, terms),
    index,
  }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.p);
}

module.exports = {
  STOPWORDS,
  PRICE_ONLY_RE,
  PRODUCT_TYPE_ROOTS,
  normalizeForMatch,
  parseHardwareQuery,
  parseMetricSpecs,
  classifyMetricPair,
  extractSearchTerms,
  scoreProduct,
  rankProducts,
};
