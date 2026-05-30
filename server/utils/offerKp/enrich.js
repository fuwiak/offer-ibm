/**
 * Обогащение контекста чата товарами из MySQL (Webasyst Shop-Script).
 */

const { v4: uuidv4 } = require("uuid");
const { query, isShopDbConfigured } = require("./db/client");
const {
  TABLES,
  ENRICH_TABLES,
  PRODUCT_COLUMNS: P,
  CATEGORY_COLUMNS: C,
  SKU_COLUMNS: S,
} = require("./db/schema");

const MAX_EXCERPT_CHARS = 2200;

const SHOP_DB_ENRICH_TIMEOUT_MS = Math.min(
  60000,
  Math.max(3000, parseInt(process.env.SHOP_DB_ENRICH_TIMEOUT_MS, 10) || 15000)
);

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
]);

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

function shopDbEnrichEnabled() {
  const flag = (process.env.SHOP_DB_ENRICH || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(flag)) return false;
  if (["1", "true", "yes", "on"].includes(flag)) return isShopDbConfigured();
  return isShopDbConfigured();
}

function htmlToPlainText(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSearchTerms(message) {
  const words = String(message || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s./-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  const seen = new Set();
  const unique = [];
  for (const w of words) {
    if (seen.has(w)) continue;
    seen.add(w);
    unique.push(w);
  }
  unique.sort((a, b) => b.length - a.length);
  return unique.slice(0, 6);
}

function getShopBaseUrl() {
  const fromEnv = (process.env.SHOP_BASE_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "https://purolat.com";
}

function buildProductUrl(baseUrl, categoryFullUrl, productUrl) {
  const slug = String(productUrl || "").replace(/^\/+|\/+$/g, "");
  const cat = String(categoryFullUrl || "").replace(/^\/+|\/+$/g, "");
  if (cat && slug) return `${baseUrl}/${cat}/${slug}/`;
  if (slug) return `${baseUrl}/${slug}/`;
  return baseUrl;
}

function formatPrice(price, currency) {
  const n = Number(price);
  if (!Number.isFinite(n)) return "";
  return `${n.toFixed(2)} ${(currency || "RUB").trim()}`;
}

function buildTermClause(columns, terms, params) {
  const likes = [];
  for (const term of terms) {
    const pattern = `%${term}%`;
    const parts = columns.map((col) => {
      params.push(pattern);
      return `${col} LIKE ?`;
    });
    likes.push(`(${parts.join(" OR ")})`);
  }
  return likes.join(" OR ");
}

function sqlLimit(limit) {
  return Math.max(1, Math.min(50, parseInt(limit, 10) || 5));
}

/** Поиск по названию/описанию товара */
async function searchByProductFields(terms, limit) {
  const params = [];
  const clause = buildTermClause(
    [`p.${P.name}`, `p.${P.summary}`, `p.${P.description}`],
    terms,
    params
  );
  const sql = `
    SELECT ${PRODUCT_SELECT}, 'product' AS match_source
    FROM ${TABLES.product} p
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE p.${P.status} = 1 AND (${clause})
    ORDER BY p.${P.totalSales} DESC
    LIMIT ${sqlLimit(limit)}
  `;
  const rows = await query(sql, params);
  return rows.map((r) => ({
    ...r,
    _tables: [TABLES.product],
    _matchSources: ["product"],
  }));
}

/** Поиск по SKU / названию варианта */
async function searchBySku(terms, limit) {
  const params = [];
  const clause = buildTermClause(
    [`s.${S.sku}`, `s.${S.name}`, `p.${P.name}`],
    terms,
    params
  );
  const sql = `
    SELECT DISTINCT ${PRODUCT_SELECT}, 'sku' AS match_source
    FROM ${TABLES.productSkus} s
    INNER JOIN ${TABLES.product} p ON p.${P.id} = s.${S.productId}
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE p.${P.status} = 1 AND (${clause})
    ORDER BY p.${P.totalSales} DESC
    LIMIT ${sqlLimit(limit)}
  `;
  const rows = await query(sql, params);
  return rows.map((r) => ({
    ...r,
    _tables: [TABLES.product, TABLES.productSkus],
    _matchSources: ["sku"],
  }));
}

/** Поиск по категории (имя, URL) */
async function searchByCategory(terms, limit) {
  const params = [];
  const clause = buildTermClause(
    [`c.${C.name}`, `c.${C.fullUrl}`],
    terms,
    params
  );
  const sql = `
    SELECT ${PRODUCT_SELECT}, 'category' AS match_source
    FROM ${TABLES.product} p
    INNER JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE p.${P.status} = 1 AND (${clause})
    ORDER BY p.${P.totalSales} DESC
    LIMIT ${sqlLimit(limit)}
  `;
  const rows = await query(sql, params);
  return rows.map((r) => ({
    ...r,
    _tables: [TABLES.product, TABLES.category],
    _matchSources: ["category"],
  }));
}

/** Поиск через shop_search_word + shop_search_index */
async function searchBySearchIndex(terms, limit) {
  const params = [];
  const clause = buildTermClause([`w.name`], terms, params);
  const sql = `
    SELECT DISTINCT ${PRODUCT_SELECT}, 'search_index' AS match_source
    FROM ${TABLES.searchWord} w
    INNER JOIN ${TABLES.searchIndex} si ON si.word_id = w.id
    INNER JOIN ${TABLES.product} p ON p.${P.id} = si.product_id
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE p.${P.status} = 1 AND (${clause})
    ORDER BY si.weight DESC, p.${P.totalSales} DESC
    LIMIT ${sqlLimit(limit)}
  `;
  const rows = await query(sql, params);
  return rows.map((r) => ({
    ...r,
    _tables: [TABLES.product, TABLES.searchWord, TABLES.searchIndex],
    _matchSources: ["search_index"],
  }));
}

/**
 * Объединяет результаты стратегий, дедуп по id, накапливает таблицы.
 * @returns {{ products: object[], tablesUsed: string[] }}
 */
function mergeSearchHits(batches, maxProducts) {
  const byId = new Map();

  for (const batch of batches) {
    for (const row of batch) {
      const id = row.id;
      if (!id) continue;
      const tables = row._tables || [];
      const sources = row._matchSources || [];

      if (!byId.has(id)) {
        const { _tables, _matchSources, match_source: _matchSource, ...product } =
          row;
        byId.set(id, {
          ...product,
          _tables: new Set(tables),
          _matchSources: new Set(sources),
        });
      } else {
        const existing = byId.get(id);
        for (const t of tables) existing._tables.add(t);
        for (const s of sources) existing._matchSources.add(s);
      }
    }
  }

  const products = [...byId.values()].map((p) => ({
    ...p,
    shopDbTables: [...p._tables].sort(),
    shopMatchSources: [...p._matchSources],
  }));

  const tablesUsed = new Set();
  for (const p of products) {
    for (const t of p.shopDbTables) tablesUsed.add(t);
  }

  return {
    products: products.slice(0, maxProducts),
    tablesUsed: [...tablesUsed].sort(),
  };
}

async function searchProductsExtended(terms, limit) {
  const perStrategy = sqlLimit(limit * 2);
  const [byProduct, bySku, byCategory, byIndex] = await Promise.all([
    searchByProductFields(terms, perStrategy),
    searchBySku(terms, perStrategy),
    searchByCategory(terms, perStrategy),
    searchBySearchIndex(terms, perStrategy),
  ]);

  return mergeSearchHits(
    [byProduct, bySku, byCategory, byIndex],
    sqlLimit(limit * 3)
  );
}

async function loadFeatureLines(productIds) {
  const map = new Map();
  const ids = productIds
    .map((id) => parseInt(id, 10))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return map;

  const placeholders = ids.map(() => "?").join(",");
  const sql = `
    SELECT pf.product_id, f.name AS feature_name, fv.value AS feature_value
    FROM ${TABLES.productFeatures} pf
    INNER JOIN ${TABLES.feature} f ON f.id = pf.feature_id
    INNER JOIN ${TABLES.featureValueVarchar} fv ON fv.id = pf.feature_value_id
    WHERE pf.product_id IN (${placeholders})
    ORDER BY pf.product_id, f.name
    LIMIT 200
  `;
  const rows = await query(sql, ids);
  for (const row of rows) {
    const pid = row.product_id;
    const line = `${row.feature_name}: ${row.feature_value}`;
    if (!map.has(pid)) map.set(pid, []);
    const arr = map.get(pid);
    if (arr.length < 8) arr.push(line);
  }
  return map;
}

const FEATURE_TABLES = [
  TABLES.productFeatures,
  TABLES.feature,
  TABLES.featureValueVarchar,
];

function rankProducts(products, terms) {
  const scored = products.map((p, index) => {
    const hay = `${p.name || ""} ${p.summary || ""}`.toLowerCase();
    let hits = 0;
    for (const t of terms) {
      if (hay.includes(t)) hits++;
    }
    const sourceBonus = (p.shopMatchSources?.length || 0) * 0.25;
    return { p, score: hits + sourceBonus, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.p);
}

function buildProductExcerpt(product, featureLines, baseUrl) {
  const name = product.name || `Товар #${product.id}`;
  const url = buildProductUrl(
    baseUrl,
    product.category_url,
    product.product_url
  );
  const priceStr = formatPrice(product.price, product.currency);
  const summary = htmlToPlainText(product.summary || "");
  const description = htmlToPlainText(product.description || "");
  let body = summary || description || name;
  if (body.length > MAX_EXCERPT_CHARS) {
    body = body.slice(0, MAX_EXCERPT_CHARS) + "...";
  }

  const lines = [
    `[Каталог · ${baseUrl.replace(/^https?:\/\//, "")}] ${name}`,
    product.category_name ? `Категория: ${product.category_name}` : null,
    priceStr ? `Цена: ${priceStr}` : null,
    `Ссылка: ${url}`,
  ].filter(Boolean);

  if (featureLines.length) {
    lines.push("Характеристики:", ...featureLines.map((l) => `  · ${l}`));
  }
  lines.push(body);
  return { name, url, excerpt: lines.join("\n"), body };
}

/**
 * Блок «таблицы БД» в конце ответа LLM.
 * @param {object} flags
 * @returns {string}
 */
function buildShopDbTablesFooter(flags = {}) {
  const tables = flags.shopDbTablesUsed;
  if (!Array.isArray(tables) || tables.length === 0) return "";
  const strategies = flags.shopDbMatchStrategies;
  const stratLine =
    Array.isArray(strategies) && strategies.length
      ? `\nСтратегии поиска: ${strategies.join(", ")}.`
      : "";
  return `\n\n---\n**Таблицы БД (каталог):** ${tables.join(", ")}.${stratLine}`;
}

async function getShopDbContext(message, options = {}) {
  const maxDocs = Math.min(10, Math.max(1, parseInt(options.maxDocs, 10) || 5));

  if (!shopDbEnrichEnabled()) {
    return {
      contextTexts: [],
      sources: [],
      flags: { shopDbSkipped: true, shopDbConfigured: isShopDbConfigured() },
    };
  }

  if (!message || typeof message !== "string" || !message.trim()) {
    return {
      contextTexts: [],
      sources: [],
      flags: { shopDbSkippedEmptyMessage: true },
    };
  }

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("SHOP_DB_TIMEOUT")),
      SHOP_DB_ENRICH_TIMEOUT_MS
    )
  );

  const runEnrich = async () => {
    const terms = extractSearchTerms(message);
    const searchTerms =
      terms.length > 0 ? terms : [String(message).trim().slice(0, 80)];

    console.log("[ShopDB] enrich start", {
      messageLen: message.length,
      terms: searchTerms,
      maxDocs,
    });

    const { products: rawMerged, tablesUsed: searchTables } =
      await searchProductsExtended(searchTerms, maxDocs * 3);
    const ranked = rankProducts(rawMerged, searchTerms).slice(0, maxDocs);
    const featureMap = await loadFeatureLines(ranked.map((p) => p.id));
    const baseUrl = getShopBaseUrl();

    const allTablesUsed = new Set(searchTables);
    for (const t of FEATURE_TABLES) allTablesUsed.add(t);

    const contextTexts = [];
    const sources = [];

    for (const product of ranked) {
      const featureLines = featureMap.get(product.id) || [];
      const productTables = [
        ...new Set([...product.shopDbTables, ...FEATURE_TABLES]),
      ].sort();
      for (const t of productTables) allTablesUsed.add(t);

      const { name, url, excerpt, body } = buildProductExcerpt(
        product,
        featureLines,
        baseUrl
      );
      const id = `shop-${product.id}-${uuidv4().slice(0, 8)}`;

      contextTexts.push(excerpt);
      sources.push({
        id,
        title: name,
        text: body.slice(0, 1000) + (body.length > 1000 ? "..." : ""),
        chunkSource: `link://${url}`,
        url,
        docSource: "Каталог",
        score: 1,
        shopProductId: product.id,
        shopCategory: product.category_name || null,
        shopDbTables: productTables,
        shopMatchSources: product.shopMatchSources || [],
      });
    }

    const shopDbTablesUsed = [...allTablesUsed].sort();
    const shopDbMatchStrategies = [
      "product_fields",
      "sku",
      "category",
      "search_index",
    ];

    console.log("[ShopDB] enrich done", {
      hits: rawMerged.length,
      selected: ranked.length,
      tables: shopDbTablesUsed,
    });

    return {
      contextTexts,
      sources,
      flags: {
        shopDbSearchHitCount: rawMerged.length,
        shopDbDocCount: ranked.length,
        shopDbTerms: searchTerms,
        shopDbTablesUsed,
        shopDbMatchStrategies,
        shopDbTimeout: false,
      },
    };
  };

  try {
    return await Promise.race([runEnrich(), timeoutPromise]);
  } catch (e) {
    if (e?.message === "SHOP_DB_TIMEOUT") {
      console.warn("[ShopDB] enrich timeout", {
        timeoutMs: SHOP_DB_ENRICH_TIMEOUT_MS,
      });
      return {
        contextTexts: [],
        sources: [],
        flags: {
          shopDbTimeout: true,
          shopDbSearchHitCount: 0,
          shopDbDocCount: 0,
        },
      };
    }
    console.warn("[ShopDB] enrich error:", e?.message || e);
    return {
      contextTexts: [],
      sources: [],
      flags: { shopDbError: true, shopDbMessage: e?.message || String(e) },
    };
  }
}

async function getCatalogEnrichContext(message, options = {}) {
  if (shopDbEnrichEnabled()) {
    return getShopDbContext(message, options);
  }
  const { getGarantContext } = require("../garant/enrich");
  if ((process.env.GARANT_TOKEN || "").trim()) {
    return getGarantContext(message, options);
  }
  return { contextTexts: [], sources: [], flags: {} };
}

function isCatalogEnrichEnabled() {
  return shopDbEnrichEnabled() || !!(process.env.GARANT_TOKEN || "").trim();
}

module.exports = {
  shopDbEnrichEnabled,
  getShopDbContext,
  getCatalogEnrichContext,
  isCatalogEnrichEnabled,
  extractSearchTerms,
  buildShopDbTablesFooter,
  ENRICH_TABLES,
};
