/**
 * NLP / regex разбор запросов к каталогу крепежа и металлопроката.
 */

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
  болт: ["болт", "bolt"],
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

function normalizeForMatch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/\s+/g, " ")
    .replace(/\bm\s*(\d+)\s*x\s*(\d+)/gi, " m$1x$2 ")
    .trim();
}

function parseHardwareQuery(message) {
  const raw = String(message || "");
  const lower = raw.toLowerCase();
  const normalized = normalizeForMatch(raw);

  const dinNumbers = [];
  for (const m of raw.matchAll(/\bdin\s*[- ]?\s*(\d{3,5})\b/gi)) {
    if (!dinNumbers.includes(m[1])) dinNumbers.push(m[1]);
  }
  for (const m of raw.matchAll(/(?:gost|гост)\s*[- ]?\s*(\d{4,5})/gi)) {
    const g = m[1];
    if (!dinNumbers.includes(g)) dinNumbers.push(g);
  }
  for (const m of raw.matchAll(/\b(\d{4,5})\s*[-–]\s*\d{2}\b/g)) {
    const g = m[1];
    if (!dinNumbers.includes(g)) dinNumbers.push(g);
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

  let thread = null;
  const threadMatch =
    normalized.match(/\bm\s*(\d+)\s*x\s*(\d+)\b/i) ||
    lower.match(/\bm\s*(\d+)\s*[x×]\s*(\d+)/i);
  if (threadMatch) {
    thread = { size: threadMatch[1], length: threadMatch[2] };
  }

  let strengthClass = null;
  const strengthMatch = lower.match(/\b(\d+\.\d+)\b/);
  if (strengthMatch) strengthClass = strengthMatch[1];

  const coating = /оцинк|ocynk|\bzn\b|цинк/i.test(lower) ? "оцинк" : null;

  const productTypes = [];
  for (const [type, roots] of Object.entries(PRODUCT_TYPE_ROOTS)) {
    if (roots.some((r) => lower.includes(r))) productTypes.push(type);
  }

  return {
    dinNumbers,
    thread,
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
  return unique.slice(0, 8);
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
  extractSearchTerms,
  scoreProduct,
  rankProducts,
};
