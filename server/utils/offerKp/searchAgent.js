/**
 * Агент поиска по каталогу MySQL: fallback, если базовый enrich не нашёл 1:1 совпадение.
 * 1) Regex / частичные LIKE-паттерны по ГОСТ/DIN, размерам, типу изделия.
 * 2) LLM выбирает релевантные позиции из пула кандидатов.
 */

const { getLLMProvider } = require("../helpers");
const { OFFER_KP_DB_SEARCH_AGENT_PROMPT } = require("./prompts");
const { query } = require("./db/client");
const {
  TABLES,
  PRODUCT_COLUMNS: P,
  CATEGORY_COLUMNS: C,
  SKU_COLUMNS: S,
} = require("./db/schema");

const PRODUCT_SELECT = `
  p.${P.id} AS id,
  p.${P.name} AS name,
  p.${P.summary} AS summary,
  p.${P.description} AS description,
  p.${P.price} AS price,
  p.${P.currency} AS currency,
  p.${P.url} AS product_url,
  c.${C.name} AS category_name,
  c.${C.fullUrl} AS category_url
`;

const EXT_PRODUCT_TYPE_ROOTS = {
  шпоночная: ["шпоночн", "шпонк", "keyway", "key steel"],
  сталь: ["сталь", "steel"],
  полоса: ["полос", "strip", "flat bar"],
  квадрат: ["квадрат", "square"],
  круг: ["круг", "round", "bar", "rod"],
  штифт: ["штифт", "pin"],
};

const FUZZY_STOPWORDS = new Set([
  "какой",
  "какая",
  "какие",
  "цена",
  "цену",
  "стоимость",
  "сколько",
  "купить",
  "нужен",
  "нужна",
  "нужно",
  "есть",
  "для",
  "the",
  "price",
  "cena",
]);

function shopDbSearchAgentEnabled() {
  const flag = (process.env.SHOP_DB_SEARCH_AGENT || "1").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(flag);
}

function shopDbSearchAgentLlmEnabled() {
  const flag = (process.env.SHOP_DB_SEARCH_AGENT_LLM || "1")
    .trim()
    .toLowerCase();
  return !["0", "false", "no", "off"].includes(flag);
}

function normalizeForMatch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/\s+/g, " ")
    .replace(/\bm\s*(\d+)\s*x\s*(\d+)/gi, " m$1x$2 ")
    .trim();
}

function sqlLimit(limit) {
  return Math.max(1, Math.min(50, parseInt(limit, 10) || 5));
}

function parseExtendedHardwareQuery(message) {
  const raw = String(message || "");
  const lower = raw.toLowerCase();
  const normalized = normalizeForMatch(raw);

  const standardNumbers = [];
  for (const m of raw.matchAll(/\bdin\s*[- ]?\s*(\d{3,5})\b/gi)) {
    if (!standardNumbers.includes(m[1])) standardNumbers.push(m[1]);
  }
  for (const m of raw.matchAll(/\bgost\s*[- ]?\s*(\d{4,5})/gi)) {
    const g = m[1];
    if (!standardNumbers.includes(g)) standardNumbers.push(g);
  }
  for (const m of raw.matchAll(/\b(\d{4,5})\s*[-–]\s*\d{2}\b/g)) {
    const g = m[1];
    if (!standardNumbers.includes(g)) standardNumbers.push(g);
  }

  let thread = null;
  const threadMatch =
    normalized.match(/\bm\s*(\d+)\s*x\s*(\d+)\b/i) ||
    lower.match(/\bm\s*(\d+)\s*[x×]\s*(\d+)/i);
  if (threadMatch) {
    thread = { size: threadMatch[1], length: threadMatch[2] };
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
  for (const [type, roots] of Object.entries(EXT_PRODUCT_TYPE_ROOTS)) {
    if (roots.some((r) => lower.includes(r))) productTypes.push(type);
  }

  return {
    standardNumbers,
    thread,
    dimensions,
    productTypes,
    normalized,
  };
}

function extractFuzzyTerms(searchText, parsed) {
  const terms = new Set();

  for (const num of parsed.standardNumbers || []) {
    terms.add(num);
  }

  if (parsed.dimensions) {
    const { a, b, c } = parsed.dimensions;
    terms.add(`${a}x${b}`);
    if (c) {
      terms.add(`${a}x${b}x${c}`);
      terms.add(`${a} x ${b} x ${c}`);
    }
  }

  if (parsed.thread) {
    terms.add(`m${parsed.thread.size}x${parsed.thread.length}`);
    terms.add(`m ${parsed.thread.size}x${parsed.thread.length}`);
  }

  for (const type of parsed.productTypes || []) {
    const roots = EXT_PRODUCT_TYPE_ROOTS[type] || [type];
    terms.add(roots[0]);
  }

  const words = String(searchText || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s./x-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length >= 3 && !FUZZY_STOPWORDS.has(w));

  for (const w of words) terms.add(w);

  return [...terms]
    .filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 12);
}

function tokenOverlapScore(queryNorm, nameNorm) {
  const qTokens = queryNorm
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !FUZZY_STOPWORDS.has(t));
  if (!qTokens.length) return 0;
  let hits = 0;
  for (const t of qTokens) {
    if (nameNorm.includes(t)) hits += 1;
  }
  return hits / qTokens.length;
}

function scoreFuzzyProduct(product, parsed, searchText) {
  const nameNorm = normalizeForMatch(product.name || "");
  const hay = `${nameNorm} ${normalizeForMatch(product.summary || "")}`;
  let score =
    tokenOverlapScore(
      parsed.normalized || normalizeForMatch(searchText),
      nameNorm
    ) * 40;

  for (const num of parsed.standardNumbers || []) {
    if (hay.includes(num)) score += 35;
    else if (nameNorm.includes(num.slice(0, 4))) score += 10;
  }

  if (parsed.dimensions) {
    const { a, b, c } = parsed.dimensions;
    const patterns = [
      `${a}x${b}x${c}`,
      `${a} x ${b} x ${c}`,
      `${a}x${b}`,
      `${a} x ${b}`,
    ].filter(Boolean);
    if (
      patterns.some(
        (p) => hay.includes(p.replace(/\s/g, "")) || hay.includes(p)
      )
    ) {
      score += 45;
    } else if (hay.includes(a) && hay.includes(b)) {
      score += 15;
    }
  }

  for (const type of parsed.productTypes || []) {
    const roots = EXT_PRODUCT_TYPE_ROOTS[type] || [type];
    if (roots.some((r) => hay.includes(r))) score += 25;
  }

  if (
    parsed.thread &&
    new RegExp(
      `m\\s*${parsed.thread.size}\\s*x\\s*${parsed.thread.length}`,
      "i"
    ).test(nameNorm)
  ) {
    score += 30;
  }

  return score;
}

function hasStrongMatch(products, searchText, parsed, minScore = 55) {
  if (!products.length) return false;
  const top = products[0];
  const score = scoreFuzzyProduct(top, parsed, searchText);
  if (score >= minScore) return true;

  const queryNorm = parsed.normalized || normalizeForMatch(searchText);
  const overlap = tokenOverlapScore(
    queryNorm,
    normalizeForMatch(top.name || "")
  );
  return overlap >= 0.6 && score >= 40;
}

function needsSearchAgentFallback(products, searchText, parsed) {
  if (!shopDbSearchAgentEnabled()) return false;
  if (!products.length) return true;
  return !hasStrongMatch(products, searchText, parsed);
}

function mapSearchRows(rows, matchSource) {
  const tables = [TABLES.product, TABLES.category];
  return rows.map((r) => ({
    ...r,
    _tables: tables,
    _matchSources: [matchSource],
    shopDbTables: tables,
    shopMatchSources: [matchSource],
  }));
}

async function searchByFuzzyRegex(searchText, parsed, limit) {
  const terms = extractFuzzyTerms(searchText, parsed);
  if (!terms.length) return [];

  const params = [];
  const likes = [];
  const columns = [
    `p.${P.name}`,
    `p.${P.summary}`,
    `s.${S.sku}`,
    `s.${S.name}`,
  ];

  for (const term of terms) {
    const pattern = `%${term}%`;
    const parts = columns.map((col) => {
      params.push(pattern);
      return `${col} LIKE ?`;
    });
    likes.push(`(${parts.join(" OR ")})`);
  }

  const sql = `
    SELECT DISTINCT ${PRODUCT_SELECT}, 'fuzzy_regex' AS match_source
    FROM ${TABLES.product} p
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    LEFT JOIN ${TABLES.productSkus} s ON s.${S.productId} = p.${P.id}
    WHERE p.${P.status} = 1 AND (${likes.join(" OR ")})
    ORDER BY p.${P.totalSales} DESC, p.${P.id} DESC
    LIMIT ${sqlLimit(limit)}
  `;

  const rows = await query(sql, params);
  return mapSearchRows(rows, "fuzzy_regex");
}

async function fetchLlmCandidatePool(searchText, parsed, limit) {
  const terms = extractFuzzyTerms(searchText, parsed).slice(0, 6);
  if (!terms.length) return [];

  const params = [];
  const likes = terms.map((term) => {
    params.push(`%${term}%`);
    return `p.${P.name} LIKE ?`;
  });

  const sql = `
    SELECT ${PRODUCT_SELECT}, 'llm_pool' AS match_source
    FROM ${TABLES.product} p
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE p.${P.status} = 1 AND (${likes.join(" OR ")})
    ORDER BY p.${P.totalSales} DESC, p.${P.id} DESC
    LIMIT ${sqlLimit(limit)}
  `;

  const rows = await query(sql, params);
  return mapSearchRows(rows, "llm_pool");
}

function parseLlmProductIds(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];

  const jsonMatch = raw.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => parseInt(v, 10))
          .filter((id) => Number.isFinite(id) && id > 0);
      }
    } catch {
      /* fall through */
    }
  }

  const ids = [];
  for (const m of raw.matchAll(/\b(\d{2,})\b/g)) {
    const id = parseInt(m[1], 10);
    if (Number.isFinite(id) && id > 0) ids.push(id);
  }
  return [...new Set(ids)];
}

async function pickProductsWithLlm(searchText, candidates, workspace) {
  if (!shopDbSearchAgentLlmEnabled() || candidates.length === 0) return [];

  const LLMConnector = getLLMProvider({
    provider: workspace?.chatProvider || null,
    model: workspace?.chatModel || null,
  });

  const catalogLines = candidates
    .slice(0, 40)
    .map((p) => `${p.id}: ${p.name}`)
    .join("\n");

  const messages = [
    {
      role: "system",
      content: OFFER_KP_DB_SEARCH_AGENT_PROMPT,
    },
    {
      role: "user",
      content: `Запрос: ${searchText}\n\nКаталог:\n${catalogLines}`,
    },
  ];

  try {
    const { textResponse } = await LLMConnector.getChatCompletion(messages, {
      temperature: 0,
    });
    const ids = parseLlmProductIds(textResponse);
    if (!ids.length) return [];

    const byId = new Map(candidates.map((p) => [p.id, p]));
    const picked = [];
    for (const id of ids) {
      const product = byId.get(id);
      if (product) {
        picked.push({
          ...product,
          _matchSources: [
            ...new Set([...(product._matchSources || []), "llm_rank"]),
          ],
        });
      }
    }
    return picked;
  } catch (err) {
    console.warn("[ShopDB Agent] LLM pick failed:", err?.message || err);
    return [];
  }
}

function mergeAgentHits(existing, extra) {
  const byId = new Map();

  for (const batch of [existing, extra]) {
    for (const row of batch) {
      const id = row.id;
      if (!id) continue;
      if (!byId.has(id)) {
        byId.set(id, { ...row });
        continue;
      }
      const prev = byId.get(id);
      const sources = new Set([
        ...(prev._matchSources || prev.shopMatchSources || []),
        ...(row._matchSources || row.shopMatchSources || []),
      ]);
      prev._matchSources = [...sources];
      prev.shopMatchSources = [...sources];
    }
  }

  return [...byId.values()];
}

function rankAgentProducts(products, searchText, parsed) {
  return products
    .map((p, index) => ({
      p,
      score: scoreFuzzyProduct(p, parsed, searchText),
      index,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.p);
}

/**
 * Fallback-поиск: regex, затем LLM по пулу кандидатов.
 * @returns {Promise<{ products: object[], strategies: string[] }>}
 */
async function runShopDbSearchAgent({
  searchText,
  parsed: baseParsed,
  existingProducts = [],
  limit = 10,
  workspace = null,
}) {
  const parsed = {
    ...parseExtendedHardwareQuery(searchText),
    ...(baseParsed || {}),
    standardNumbers: [
      ...new Set([
        ...(parseExtendedHardwareQuery(searchText).standardNumbers || []),
        ...(baseParsed?.dinNumbers || []),
      ]),
    ],
  };

  const strategies = [];
  let products = [...existingProducts];

  if (!needsSearchAgentFallback(products, searchText, parsed)) {
    return { products, strategies };
  }

  const fuzzyHits = await searchByFuzzyRegex(searchText, parsed, limit * 2);
  if (fuzzyHits.length) {
    strategies.push("fuzzy_regex");
    products = mergeAgentHits(products, fuzzyHits);
    products = rankAgentProducts(products, searchText, parsed);
    if (hasStrongMatch(products, searchText, parsed)) {
      return { products: products.slice(0, limit), strategies };
    }
  }

  if (shopDbSearchAgentLlmEnabled()) {
    const pool = await fetchLlmCandidatePool(searchText, parsed, 40);
    const llmPicked = await pickProductsWithLlm(searchText, pool, workspace);
    if (llmPicked.length) {
      strategies.push("llm_rank");
      products = mergeAgentHits(products, llmPicked);
      products = rankAgentProducts(products, searchText, parsed);
    }
  }

  return { products: products.slice(0, limit), strategies };
}

module.exports = {
  shopDbSearchAgentEnabled,
  shopDbSearchAgentLlmEnabled,
  parseExtendedHardwareQuery,
  needsSearchAgentFallback,
  runShopDbSearchAgent,
};
