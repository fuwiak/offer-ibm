/**
 * Агент поиска товаров в MySQL-каталоге purolat.com.
 *
 * Pipeline (по приоритету):
 *  1) exact_sku   — точное совпадение артикула
 *  2) structured  — DIN/ГОСТ + тип + габариты + резьба
 *  3) keywords    — поля товара, SKU LIKE, категория, search_index
 *  4) fuzzy_regex  — regex/LIKE fallback (searchAgent)
 *  5) name_cosine  — TF-IDF + cosine по названию (searchAgent)
 *  6) llm_rank     — LLM выбирает id из пула кандидатов (searchAgent)
 */

const { query } = require("./db/client");
const {
  buildRetrievalCacheKey,
  getCachedRetrieval,
  setCachedRetrieval,
  resolveIndexVersion,
  resolvePipelineVersion,
} = require("./db/layeredCache");
const { getCanonicalCatalogManifest } = require("./canonicalCatalogIndex");
const shopDbLog = require("./shopDbLog");
const {
  parseHardwareQuery,
  extractSearchTerms,
  scoreProduct,
  STOPWORDS,
  PRICE_ONLY_RE,
} = require("./hardwareQuery");
const {
  applyAnalogScoringPenalty,
  applyMatchPriorityBonus,
  detectAnalogIntent,
  expandDinNumbersWithEquivalents,
} = require("./analogRules");
const {
  nameSimilarityScore,
  searchByNameSimilarity,
  applyCatalogCandidateQuota,
} = require("./nameSimilarity");
const { searchProductsExtended } = require("./shopDbSearch");
const {
  isRerankerEnabled,
  computeRerankScores,
} = require("./crossEncoderRerank");
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
const { OFFER_KP_INTENTS, routeOfferKpMessage } = require("./intentRouter");

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
const RETRIEVAL_WINDOW = Math.max(
  50,
  Math.min(100, parseInt(process.env.SHOP_DB_RETRIEVAL_WINDOW, 10) || 100)
);

/** Cap for SQL / agent LIMIT clauses — must allow Top-100 output windows. */
function sqlLimit(limit) {
  return Math.max(1, Math.min(200, parseInt(limit, 10) || 5));
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
    /\bgost\s*\d{4}/i.test(text) ||
    extractSkuCodes(text).length
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

function isCatalogListingRequest(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase();
  if (!t) return false;
  if (/из\s+каталога\s+purolat|каталога\s+purolat\.com/i.test(t)) return true;
  if (/список\s+позиций\s+из\s+каталога/i.test(t)) return true;
  if (
    (/черновик\s+кп|кп\s+по\s+списку|сформируй.*кп/i.test(t) ||
      /draft.*quote|quote.*catalog/i.test(t)) &&
    /каталог|catalog|purolat/i.test(t)
  ) {
    return true;
  }
  return false;
}

function isOfferFollowUp(text) {
  const t = String(text || "").trim();
  if (!t || hasHardwareSignals(t)) return false;
  return (
    /коммерческ|оферт|\bкп\b|предложен/i.test(t) || /ofert|propozycj/i.test(t)
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
    if (isCatalogRelayRequest(content) && !hasHardwareSignals(content))
      continue;
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
  const parsedTexts = (options.parsedFileTexts || []).filter(Boolean);
  if (parsedTexts.length) {
    let normalizedParsed = parsedTexts;
    try {
      const { normalizeOcrInquiryText } = require("./parseInquiry");
      normalizedParsed = parsedTexts.map(normalizeOcrInquiryText);
    } catch {
      /* optional */
    }
    text = `${normalizedParsed.join("\n\n")}\n${text}`.trim();
  }
  const history = options.chatHistory || options.history || [];
  const skuCodes = extractSkuCodes(text);

  const needsHistory =
    isPriceOnlyQuery(String(message || "").trim()) ||
    detectAnalogIntent(String(message || "").trim()) ||
    (skuCodes.length &&
      isSkuOnlyQuery(String(message || "").trim(), skuCodes)) ||
    isCatalogRelayRequest(String(message || "").trim()) ||
    isCatalogListingRequest(String(message || "").trim()) ||
    isOfferFollowUp(String(message || "").trim()) ||
    (parsedTexts.length && isOfferFollowUp(text));

  if (needsHistory) {
    const prior = collectPriorHardwareContext(history);
    if (prior && prior !== text) {
      text = `${prior}\n${text}`;
    }
  }

  return text;
}

function mapSearchRows(
  rows,
  matchSource,
  tables = [TABLES.product, TABLES.category]
) {
  return rows.map((r) => ({
    ...r,
    _tables: tables,
    _matchSources: [matchSource],
    shopDbTables: tables,
    shopMatchSources: [matchSource],
    _exactSku: matchSource === "exact_sku",
    _catalogNameExact: matchSource === "catalog_name_exact",
  }));
}

/** Whitespace-collapsed catalog title key (must match matchInquiryLines). */
function catalogNameKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function searchByExactSku(skuCodes, limit) {
  const codes = [
    ...new Set(skuCodes.map((c) => String(c).trim()).filter(Boolean)),
  ];
  if (!codes.length) return [];

  const placeholders = codes.map(() => "?").join(",");
  const sql = `
    SELECT DISTINCT ${PRODUCT_SELECT}, s.${S.sku} AS matched_sku,
           s.price AS matched_sku_price, 'exact_sku' AS match_source
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

/**
 * Literal ShopDB product title hit (whitespace-normalized). Pins SKU + price
 * before RRF / embedding / analogRules — same authority as exact_sku.
 */
async function searchByExactCatalogName(queryText, limit) {
  const key = catalogNameKey(queryText);
  if (!key || key.length < 8) return [];

  // Collapse runs of whitespace in MySQL so "DIN  967" == "DIN 967".
  const sql = `
    SELECT ${PRODUCT_SELECT}, s.${S.sku} AS matched_sku,
           s.price AS matched_sku_price, 'catalog_name_exact' AS match_source
    FROM ${TABLES.product} p
    INNER JOIN ${TABLES.productSkus} s ON s.${S.productId} = p.${P.id}
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE p.${P.status} = 1
      AND LOWER(TRIM(REGEXP_REPLACE(p.${P.name}, '[[:space:]]+', ' '))) = ?
    ORDER BY s.count DESC, s.${S.sku} ASC, p.${P.id} DESC
    LIMIT ${sqlLimit(limit)}
  `;

  const rows = await query(sql, [key]);
  // One row per product — first SKU wins (highest stock via ORDER BY).
  const byProduct = new Map();
  for (const row of rows || []) {
    if (!row?.id || byProduct.has(row.id)) continue;
    byProduct.set(row.id, row);
  }
  return mapSearchRows([...byProduct.values()], "catalog_name_exact", [
    TABLES.product,
    TABLES.productSkus,
  ]);
}

function mergeRetrievalMeta(previous, next) {
  if (!previous) return next;
  if (!next) return previous;
  const maxNum = (a, b) => {
    const left = Number(a);
    const right = Number(b);
    if (!Number.isFinite(left)) return Number.isFinite(right) ? right : a ?? b;
    if (!Number.isFinite(right)) return left;
    return Math.max(left, right);
  };
  return {
    _canonicalText: previous._canonicalText || next._canonicalText || null,
    _signature: previous._signature || next._signature || null,
    _signatureHard: [
      ...new Set([
        ...(previous._signatureHard || []),
        ...(next._signatureHard || []),
      ]),
    ],
    _bm25Score: maxNum(previous._bm25Score, next._bm25Score),
    _denseSimilarity: maxNum(previous._denseSimilarity, next._denseSimilarity),
    _embeddingSimilarity: maxNum(
      previous._embeddingSimilarity,
      next._embeddingSimilarity
    ),
    _nameSimilarity: maxNum(previous._nameSimilarity, next._nameSimilarity),
    _rrfScore: maxNum(previous._rrfScore, next._rrfScore),
    _canonicalSimilarity: maxNum(
      previous._canonicalSimilarity,
      next._canonicalSimilarity
    ),
    _retrievalMatchType:
      previous._retrievalMatchType || next._retrievalMatchType || null,
  };
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
          _catalogNameExact: !!row._catalogNameExact,
        });
        continue;
      }

      const prev = byId.get(id);
      const meta = mergeRetrievalMeta(prev, row);
      for (const t of tables) prev._tables.add(t);
      for (const s of sources) prev._matchSources.add(s);
      Object.assign(prev, meta);
      prev._exactSku = prev._exactSku || !!row._exactSku;
      prev._catalogNameExact =
        prev._catalogNameExact || !!row._catalogNameExact;
      if (row.matched_sku) prev.matched_sku = row.matched_sku;
    }
  }

  return [...byId.values()].map((p) => ({
    ...p,
    shopDbTables: [...p._tables].sort(),
    shopMatchSources: [...p._matchSources],
  }));
}

function rankAgentProducts(
  products,
  terms,
  parsed,
  skuCodes = [],
  searchText = ""
) {
  const skuSet = new Set(skuCodes.map(String));

  const scored = products.map((p, index) => {
    let score = scoreProduct(p, parsed, terms);
    score = applyAnalogScoringPenalty(parsed, p, score);
    score = applyMatchPriorityBonus(searchText, parsed, p, score);
    if (p._exactSku || p.shopMatchSources?.includes("exact_sku")) score += 1000;
    if (p.matched_sku && skuSet.has(String(p.matched_sku))) score += 500;
    if (p.shopMatchSources?.includes("name_cosine") || p._nameSimilarity) {
      score += Math.round(
        (p._nameSimilarity || nameSimilarityScore(searchText, p.name)) * 80
      );
    }
    // Price/stock must NOT decide product identity — only exact/analog gates
    // later pick the cheapest SKU inside a confirmed signature.
    return { p, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((row) => row.p);
}

function buildProductSearchAgentCacheKey({
  message,
  chatHistory = null,
  limit = 10,
  parsedFileTexts = null,
  indexVersion = null,
  pipelineVersion = null,
}) {
  const parsedTexts = (parsedFileTexts || []).filter(Boolean);
  const searchText = buildProductSearchText(message, {
    chatHistory,
    history: chatHistory,
    parsedFileTexts: parsedTexts,
  });
  // Requested limit (not sqlLimit-capped) so Top-50 ≠ Top-100 cache keys.
  return buildRetrievalCacheKey({
    queryText: searchText,
    limit,
    indexVersion:
      indexVersion || resolveIndexVersion(getCanonicalCatalogManifest()),
    pipelineVersion:
      pipelineVersion ||
      resolvePipelineVersion({ retrievalWindow: RETRIEVAL_WINDOW }),
    extra: [String(message || "").trim(), parsedTexts.join("\n\n")]
      .filter(Boolean)
      .join("\n---\n"),
  });
}

/**
 * Главная точка входа агента поиска товаров.
 */
async function runProductSearchAgent({
  message,
  chatHistory = null,
  workspace = null,
  limit = 10,
  parsedFileTexts = null,
}) {
  const agentCacheKey = buildProductSearchAgentCacheKey({
    message,
    chatHistory,
    limit,
    parsedFileTexts,
  });
  const parsedTexts = (parsedFileTexts || []).filter(Boolean);
  const searchText = buildProductSearchText(message, {
    chatHistory,
    history: chatHistory,
    parsedFileTexts: parsedTexts,
  });
  const routedIntent = routeOfferKpMessage(String(message || "").trim());
  if (routedIntent.primaryIntent === OFFER_KP_INTENTS.UNSAFE_OR_FORBIDDEN) {
    shopDbLog.skip("product search agent skipped — forbidden intent", {
      intent: routedIntent.primaryIntent,
    });
    const skipped = {
      products: [],
      strategies: [],
      searchText,
      parsed: parseHardwareQuery(searchText),
      signals: { intent: routedIntent },
      tablesUsed: [],
    };
    setCachedRetrieval(agentCacheKey, skipped);
    return skipped;
  }
  const cachedAgent = getCachedRetrieval(agentCacheKey);
  if (cachedAgent) {
    shopDbLog.skip("product search agent cache hit", {
      messageLen: String(message || "").length,
      hits: cachedAgent.products?.length || 0,
      cacheKeyPrefix: String(agentCacheKey).slice(0, 48),
    });
    return cachedAgent;
  }
  const parsed = parseHardwareQuery(searchText);
  const analogIntent = detectAnalogIntent(
    `${String(message || "")}\n${searchText}`
  );
  // Keep requested standards for primary SQL structured search. Expanding
  // DIN↔GOST here OR-pollutes results (DIN 933 line that also lists GOST 7798
  // pulled in DIN 931 candidates and wrong cheapest "exact").
  const requestedDinNumbers = [...(parsed.dinNumbers || [])];
  const expandedDinNumbers =
    expandDinNumbersWithEquivalents(requestedDinNumbers);
  parsed.dinNumbers = requestedDinNumbers;
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
    analogIntent,
  };

  shopDbLog.info("product search agent", {
    messageLen: String(message || "").length,
    searchTextLen: searchText.length,
    skuCodes,
    skuOnly,
    analogIntent,
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
    !analogIntent &&
    !isPriceOnlyQuery(message) &&
    !isOfferFollowUp(message) &&
    !isCatalogRelayRequest(message) &&
    !isCatalogListingRequest(message) &&
    !(parsedTexts.length && hasHardwareSignals(searchText))
  ) {
    shopDbLog.skip("product search agent skipped — not a catalog query");
    const skipped = {
      products: [],
      strategies: [],
      searchText,
      parsed,
      signals,
      tablesUsed: [],
    };
    setCachedRetrieval(agentCacheKey, skipped);
    return skipped;
  }

  const strategies = [];
  let products = [];
  const searchLimit = analogIntent ? Math.max(limit, 12) * 3 : limit * 3;

  if (skuCodes.length) {
    const skuHits = await searchByExactSku(skuCodes, searchLimit);
    if (skuHits.length) {
      strategies.push("exact_sku");
      products = mergeProductHits([products, skuHits]);
      shopDbLog.ok("exact SKU hit", {
        sku: skuCodes,
        products: skuHits.map((p) => ({ id: p.id, name: p.name })),
      });

      // Exact article hit owns identity + price. Stop widening to siblings /
      // cheaper name matches / search-agent fallbacks.
      const hitSkus = new Set(
        skuHits.map((p) => String(p.matched_sku || "").trim()).filter(Boolean)
      );
      const allRequestedCovered = skuCodes.every((code) =>
        hitSkus.has(String(code).trim())
      );
      if (allRequestedCovered) {
        products = products.filter(
          (p) =>
            p._exactSku ||
            p.shopMatchSources?.includes("exact_sku") ||
            (p.matched_sku && hitSkus.has(String(p.matched_sku)))
        );
        const tablesUsed = new Set([TABLES.product, TABLES.productSkus]);
        for (const p of products) {
          for (const t of p.shopDbTables || []) tablesUsed.add(t);
        }
        shopDbLog.ok("product search agent done", {
          strategies: [...new Set(strategies)],
          hits: products.length,
          productIds: products.map((p) => p.id),
          titles: products.map((p) => p.name?.slice(0, 60)),
          earlyExit: "exact_sku",
        });
        const result = {
          products: products.slice(0, sqlLimit(limit)),
          strategies: [...new Set(strategies)],
          searchText,
          parsed,
          signals,
          tablesUsed: [...tablesUsed],
          earlyExit: "exact_sku",
        };
        setCachedRetrieval(agentCacheKey, result);
        return result;
      }
    }
  }

  // Exact catalog title owns identity + price. Skip RRF / embedding /
  // analog widen — heuristics only when ShopDB has no literal name row.
  {
    const nameHits = await searchByExactCatalogName(searchText, searchLimit);
    if (nameHits.length) {
      strategies.push("catalog_name_exact");
      products = mergeProductHits([products, nameHits]);
      products = products.filter(
        (p) =>
          p._catalogNameExact ||
          p.shopMatchSources?.includes("catalog_name_exact")
      );
      const tablesUsed = new Set([TABLES.product, TABLES.productSkus]);
      for (const p of products) {
        for (const t of p.shopDbTables || []) tablesUsed.add(t);
      }
      shopDbLog.ok("product search agent done", {
        strategies: [...new Set(strategies)],
        hits: products.length,
        productIds: products.map((p) => p.id),
        titles: products.map((p) => p.name?.slice(0, 60)),
        earlyExit: "catalog_name_exact",
      });
      const result = {
        products: products.slice(0, sqlLimit(limit)),
        strategies: [...new Set(strategies)],
        searchText,
        parsed,
        signals,
        tablesUsed: [...tablesUsed],
        earlyExit: "catalog_name_exact",
      };
      setCachedRetrieval(agentCacheKey, result);
      return result;
    }
  }

  const { products: baseProducts, tablesUsed: baseTables } =
    await searchProductsExtended(searchTerms, parsed, searchLimit);

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

  const ragHits = await searchByNameSimilarity(
    searchText,
    searchTerms,
    RETRIEVAL_WINDOW
  );
  if (ragHits.length) {
    strategies.push("catalog_bm25", "catalog_dense", "rrf");
    products = mergeProductHits([products, ragHits]);
  }

  if (shopDbSearchAgentEnabled()) {
    const agentParsed = {
      ...parseExtendedHardwareQuery(searchText),
      dinNumbers: [
        ...new Set([
          ...(parseExtendedHardwareQuery(searchText).standardNumbers || []),
          ...expandedDinNumbers,
        ]),
      ],
    };
    const forceAnalogWiden = analogIntent;
    if (
      forceAnalogWiden ||
      needsSearchAgentFallback(products, searchText, {
        ...agentParsed,
        dinNumbers: expandedDinNumbers,
      })
    ) {
      const agentResult = await runShopDbSearchAgent({
        searchText,
        parsed: agentParsed,
        existingProducts: products,
        limit: searchLimit,
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

  products = rankAgentProducts(
    products,
    searchTerms,
    parsed,
    skuCodes,
    message
  );
  products = applyCatalogCandidateQuota(
    searchText,
    products,
    Math.max(limit, RETRIEVAL_WINDOW)
  );

  if (skuOnly && skuCodes.length) {
    const exactMatches = products.filter(
      (p) =>
        p._exactSku ||
        p.shopMatchSources?.includes("exact_sku") ||
        (p.matched_sku && skuCodes.includes(String(p.matched_sku)))
    );
    if (exactMatches.length) products = exactMatches;
  }

  // Экспериментальный cross-encoder rerank поверх уже найденного топа — см.
  // crossEncoderRerank.js. Выключен по умолчанию (SHOP_DB_RERANKER_ENABLED=0).
  if (isRerankerEnabled() && products.length > 1) {
    const rerankScores = await computeRerankScores(message, products);
    if (rerankScores.size) {
      products = [...products].sort(
        (a, b) =>
          (rerankScores.get(b.id) ?? -1) - (rerankScores.get(a.id) ?? -1)
      );
    }
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

  const result = {
    products,
    strategies: [...new Set(strategies)],
    searchText,
    parsed,
    signals,
    tablesUsed: [...tablesUsed].sort(),
  };
  setCachedRetrieval(agentCacheKey, result);
  return result;
}

module.exports = {
  RETRIEVAL_WINDOW,
  sqlLimit,
  mergeProductHits,
  mergeRetrievalMeta,
  buildProductSearchText,
  buildProductSearchAgentCacheKey,
  collectPriorHardwareContext,
  extractSkuCodes,
  isCatalogRelayRequest,
  isCatalogListingRequest,
  isOfferFollowUp,
  isPriceOnlyQuery,
  isSkuOnlyQuery,
  hasHardwareSignals,
  catalogNameKey,
  searchByExactSku,
  searchByExactCatalogName,
  runProductSearchAgent,
  detectAnalogIntent,
};
