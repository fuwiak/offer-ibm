/**
 * Агент поиска товаров в MySQL-каталоге purolat.com.
 *
 * Pipeline (по приоритету):
 *  1) exact_sku   — точное совпадение артикула
 *  2) structured  — DIN/ГОСТ + тип + габариты + резьба
 *  3) keywords    — поля товара, SKU LIKE, категория, search_index
 *  4) fuzzy_regex — regex/LIKE fallback (searchAgent)
 *  5) llm_rank    — LLM выбирает id из пула кандидатов (searchAgent)
 */

const { query } = require("./db/client");
const shopDbLog = require("./shopDbLog");
const {
  parseHardwareQuery,
  extractSearchTerms,
  rankProducts,
  scoreProduct,
  STOPWORDS,
  PRICE_ONLY_RE,
} = require("./hardwareQuery");
const { applyAnalogScoringPenalty } = require("./analogRules");
const { searchProductsExtended } = require("./shopDbSearch");
const {
  shopDbSearchAgentEnabled,
  runShopDbSearchAgent,
  parseExtendedHardwareQuery,
  needsSearchAgentFallback,
} = require("./searchAgent");
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

const SKU_RE = /\b(\d{8,18})\b/g;
const ART_PREFIX_RE =
  /(?:арт\.?|art\.?|sku\s*:?\s*#?\s*|код\s*:?\s*)(\d{5,18})/gi;

function sqlLimit(limit) {
  return Math.max(1, Math.min(50, parseInt(limit, 10) || 5));
}

function historyMessageText(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return String(
    entry.content || entry.userPrompt || entry.text || entry.message || ""
  ).trim();
}

function hasHardwareSignals(text) {
  const parsed = parseHardwareQuery(text);
  return !!(
    parsed.dinNumbers.length ||
    parsed.productTypes.length ||
    parsed.thread ||
    parsed.dimensions ||
    /\bdin\s*\d{3}/i.test(text) ||
    /\bgost\s*\d{4}/i.test(text)
  );
}

function extractSkuCodes(text) {
  const raw = String(text || "");
  const codes = new Set();

  for (const m of raw.matchAll(SKU_RE)) {
    if (m[1].length >= 8) codes.add(m[1]);
  }
  for (const m of raw.matchAll(ART_PREFIX_RE)) {
    codes.add(m[1]);
  }

  return [...codes];
}

function isPriceOnlyQuery(text) {
  const t = String(text || "").trim();
  if (!t || hasHardwareSignals(t)) return false;
  if (PRICE_ONLY_RE.test(t)) return true;
  return t.length <= 30 && /cena|price|цен/i.test(t);
}

function isSkuOnlyQuery(message, skuCodes = []) {
  const t = String(message || "").trim();
  if (!t || !skuCodes.length) return false;
  const stripped = t
    .replace(ART_PREFIX_RE, " ")
    .replace(SKU_RE, " ")
    .replace(/[^\p{L}\p{N}]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w.toLowerCase()));
  return stripped.length <= 2;
}

const CATALOG_RELAY_RE =
  /(?:передай|предоставь|пришли|выведи|show|provide|send).{0,48}(?:\[?\s*каталог|catalog\s*block)/i;

function isUserHistoryEntry(entry) {
  const role = String(entry?.role || entry?.type || entry?.from || "")
    .trim()
    .toLowerCase();
  if (!role) return true;
  return ["user", "human"].includes(role);
}

function isCatalogRelayRequest(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (CATALOG_RELAY_RE.test(t)) return true;
  if (/\[каталог\s*·/i.test(t) && t.length <= 160) return true;
  return false;
}

function isOfferFollowUp(text) {
  const t = String(text || "").trim();
  if (!t || hasHardwareSignals(t)) return false;
  return (
    /коммерческ|оферт|\bкп\b|предложен/i.test(t) ||
    /ofert|propozycj/i.test(t)
  );
}

function collectPriorHardwareContext(history, maxMessages = 5) {
  const list = Array.isArray(history) ? history : [];
  const parts = [];

  for (let i = list.length - 1; i >= 0 && parts.length < maxMessages; i--) {
    const entry = list[i];
    if (!isUserHistoryEntry(entry)) continue;
    const content = historyMessageText(entry);
    if (!content || content === parts.join("\n")) continue;
    if (isCatalogRelayRequest(content) && !hasHardwareSignals(content)) continue;
    if (hasHardwareSignals(content) || content.length >= 24) {
      parts.unshift(content);
    }
  }

  return parts.join("\n");
}

/**
 * Текст для поиска: текущее сообщение + контекст из истории (цена, артикул, КП).
 */
function buildProductSearchText(message, options = {}) {
  let text = String(message || "").trim();
  const history = options.chatHistory || options.history || [];
  const skuCodes = extractSkuCodes(text);

  const needsHistory =
    isPriceOnlyQuery(text) ||
    (skuCodes.length && isSkuOnlyQuery(text, skuCodes)) ||
    isCatalogRelayRequest(text) ||
    isOfferFollowUp(text);

  if (needsHistory) {
    const prior = collectPriorHardwareContext(history);
    if (prior && prior !== text) {
      text = `${prior}\n${text}`;
    }
  }

  return text;
}

function mapSearchRows(rows, matchSource, tables = [TABLES.product, TABLES.category]) {
  return rows.map((r) => ({
    ...r,
    _tables: tables,
    _matchSources: [matchSource],
    shopDbTables: tables,
    shopMatchSources: [matchSource],
    _exactSku: matchSource === "exact_sku",
  }));
}

async function searchByExactSku(skuCodes, limit) {
  const codes = [...new Set(skuCodes.map((c) => String(c).trim()).filter(Boolean))];
  if (!codes.length) return [];

  const placeholders = codes.map(() => "?").join(",");
  const sql = `
    SELECT DISTINCT ${PRODUCT_SELECT}, s.${S.sku} AS matched_sku, 'exact_sku' AS match_source
    FROM ${TABLES.productSkus} s
    INNER JOIN ${TABLES.product} p ON p.${P.id} = s.${S.productId}
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE p.${P.status} = 1 AND s.${S.sku} IN (${placeholders})
    ORDER BY p.${P.totalSales} DESC, p.${P.id} DESC
    LIMIT ${sqlLimit(limit)}
  `;

  const rows = await query(sql, codes);
  return mapSearchRows(rows, "exact_sku", [TABLES.product, TABLES.productSkus]);
}

function mergeProductHits(batches) {
  const byId = new Map();

  for (const batch of batches) {
    for (const row of batch) {
      const id = row.id;
      if (!id) continue;
      const sources = row._matchSources || row.shopMatchSources || [];
      const tables = row._tables || row.shopDbTables || [];

      if (!byId.has(id)) {
        byId.set(id, {
          ...row,
          _tables: new Set(tables),
          _matchSources: new Set(sources),
          _exactSku: !!row._exactSku,
        });
        continue;
      }

      const prev = byId.get(id);
      for (const t of tables) prev._tables.add(t);
      for (const s of sources) prev._matchSources.add(s);
      prev._exactSku = prev._exactSku || !!row._exactSku;
      if (row.matched_sku) prev.matched_sku = row.matched_sku;
    }
  }

  return [...byId.values()].map((p) => ({
    ...p,
    shopDbTables: [...p._tables].sort(),
    shopMatchSources: [...p._matchSources],
  }));
}

function rankAgentProducts(products, terms, parsed, skuCodes = []) {
  const skuSet = new Set(skuCodes.map(String));

  const scored = products.map((p, index) => {
    let score = scoreProduct(p, parsed, terms);
    score = applyAnalogScoringPenalty(parsed, p, score);
    if (p._exactSku || p.shopMatchSources?.includes("exact_sku")) score += 1000;
    if (p.matched_sku && skuSet.has(String(p.matched_sku))) score += 500;
    return { p, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.p);
}

/**
 * Главная точка входа агента поиска товаров.
 */
async function runProductSearchAgent({
  message,
  chatHistory = null,
  workspace = null,
  limit = 10,
}) {
  const searchText = buildProductSearchText(message, {
    chatHistory,
    history: chatHistory,
  });
  const parsed = parseHardwareQuery(searchText);
  const terms = extractSearchTerms(searchText);
  const searchTerms =
    terms.length > 0 ? terms : [String(searchText).trim().slice(0, 120)];
  const skuCodes = extractSkuCodes(String(message || ""));
  const skuOnly = isSkuOnlyQuery(message, skuCodes);

  const signals = {
    skuCodes,
    skuOnly,
    searchTerms,
    hasHardware: hasHardwareSignals(searchText),
  };

  shopDbLog.info("product search agent", {
    messageLen: String(message || "").length,
    searchTextLen: searchText.length,
    skuCodes,
    skuOnly,
    terms: searchTerms,
    parsed: {
      dinNumbers: parsed.dinNumbers,
      dimensions: parsed.dimensions,
      thread: parsed.thread,
      productTypes: parsed.productTypes,
    },
  });

  if (
    !signals.hasHardware &&
    !skuCodes.length &&
    !isPriceOnlyQuery(message) &&
    !isOfferFollowUp(message) &&
    !isCatalogRelayRequest(message)
  ) {
    shopDbLog.skip("product search agent skipped — not a catalog query");
    return {
      products: [],
      strategies: [],
      searchText,
      parsed,
      signals,
      tablesUsed: [],
    };
  }

  const strategies = [];
  let products = [];

  if (skuCodes.length) {
    const skuHits = await searchByExactSku(skuCodes, limit);
    if (skuHits.length) {
      strategies.push("exact_sku");
      products = mergeProductHits([products, skuHits]);
      shopDbLog.ok("exact SKU hit", {
        sku: skuCodes,
        products: skuHits.map((p) => ({ id: p.id, name: p.name })),
      });
    }
  }

  const { products: baseProducts, tablesUsed: baseTables } =
    await searchProductsExtended(searchTerms, parsed, limit * 3);

  if (baseProducts.length) {
    strategies.push(
      "structured",
      "product_fields",
      "sku",
      "category",
      "search_index"
    );
    products = mergeProductHits([products, baseProducts]);
  }

  if (shopDbSearchAgentEnabled()) {
    const agentParsed = {
      ...parseExtendedHardwareQuery(searchText),
      dinNumbers: [
        ...new Set([
          ...(parseExtendedHardwareQuery(searchText).standardNumbers || []),
          ...(parsed.dinNumbers || []),
        ]),
      ],
    };
    if (needsSearchAgentFallback(products, searchText, agentParsed)) {
      const agentResult = await runShopDbSearchAgent({
        searchText,
        parsed: agentParsed,
        existingProducts: products,
        limit: limit * 3,
        workspace,
      });
      if (agentResult.strategies?.length) {
        strategies.push(...agentResult.strategies);
        products = mergeProductHits([products, agentResult.products]);
      }
    } else {
      shopDbLog.skip("search agent skipped", {
        existing: products.length,
        reason: "strong catalog match",
      });
    }
  }

  products = rankAgentProducts(products, searchTerms, parsed, skuCodes);

  if (skuOnly && skuCodes.length) {
    const exactMatches = products.filter(
      (p) =>
        p._exactSku ||
        p.shopMatchSources?.includes("exact_sku") ||
        (p.matched_sku && skuCodes.includes(String(p.matched_sku)))
    );
    if (exactMatches.length) products = exactMatches;
  }

  products = products.slice(0, sqlLimit(limit));

  const tablesUsed = new Set(baseTables || []);
  for (const p of products) {
    for (const t of p.shopDbTables || []) tablesUsed.add(t);
  }

  shopDbLog.ok("product search agent done", {
    strategies: [...new Set(strategies)],
    hits: products.length,
    productIds: products.map((p) => p.id),
    titles: products.map((p) => p.name?.slice(0, 60)),
  });

  return {
    products,
    strategies: [...new Set(strategies)],
    searchText,
    parsed,
    signals,
    tablesUsed: [...tablesUsed].sort(),
  };
}

module.exports = {
  buildProductSearchText,
  collectPriorHardwareContext,
  extractSkuCodes,
  isCatalogRelayRequest,
  isOfferFollowUp,
  isPriceOnlyQuery,
  isSkuOnlyQuery,
  hasHardwareSignals,
  searchByExactSku,
  runProductSearchAgent,
};
