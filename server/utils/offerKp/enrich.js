/**
 * Обогащение контекста чата товарами из MySQL (Webasyst Shop-Script).
 */

const { v4: uuidv4 } = require("uuid");
const { query, isShopDbConfigured } = require("./db/client");
const {
  shopDbSearchAgentEnabled,
  runShopDbSearchAgent,
} = require("./searchAgent");
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

function normalizeForMatch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/\s+/g, " ")
    .replace(/\bm\s*(\d+)\s*x\s*(\d+)/gi, " m$1x$2 ")
    .trim();
}

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

/**
 * Разбор технического запроса крепежа.
 * @param {string} message
 */
function parseHardwareQuery(message) {
  const raw = String(message || "");
  const lower = raw.toLowerCase();
  const normalized = normalizeForMatch(raw);

  const dinNumbers = [];
  for (const m of raw.matchAll(/\bdin\s*[- ]?\s*(\d{3,4})\b/gi)) {
    if (!dinNumbers.includes(m[1])) dinNumbers.push(m[1]);
  }
  for (const m of raw.matchAll(/\bgost\s*[- ]?\s*(\d{4,5})/gi)) {
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

/** Точный поиск: AND по DIN, типу изделия, резьбе M×L */
async function searchByStructuredQuery(parsed, limit) {
  const conditions = [`p.${P.status} = 1`];
  const params = [];

  if (
    !parsed.dinNumbers.length &&
    !parsed.productTypes.length &&
    !parsed.thread
  ) {
    return [];
  }

  if (parsed.dinNumbers.length) {
    const dinParts = parsed.dinNumbers.map(() => `p.${P.name} LIKE ?`);
    params.push(...parsed.dinNumbers.map((d) => `%${d}%`));
    conditions.push(`(${dinParts.join(" OR ")})`);
  }

  if (parsed.productTypes.length) {
    const typeParts = [];
    for (const type of parsed.productTypes) {
      for (const root of PRODUCT_TYPE_ROOTS[type] || [type]) {
        typeParts.push(`p.${P.name} LIKE ?`);
        params.push(`%${root}%`);
      }
    }
    if (typeParts.length) conditions.push(`(${typeParts.join(" OR ")})`);
  }

  if (parsed.thread) {
    const { size, length } = parsed.thread;
    conditions.push(
      `(p.${P.name} LIKE ? OR p.${P.name} LIKE ? OR p.${P.name} LIKE ? OR p.${P.name} LIKE ?)`
    );
    params.push(
      `%M ${size}x${length}%`,
      `%M ${size} x ${length}%`,
      `%M${size}x${length}%`,
      `%M ${size}×${length}%`
    );
  }

  const sql = `
    SELECT ${PRODUCT_SELECT}, 'structured' AS match_source
    FROM ${TABLES.product} p
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE ${conditions.join(" AND ")}
    ORDER BY p.${P.totalSales} DESC, p.${P.id} DESC
    LIMIT ${sqlLimit(limit)}
  `;
  const rows = await query(sql, params);
  return rows.map((r) => ({
    ...r,
    _tables: [TABLES.product, TABLES.category],
    _matchSources: ["structured"],
  }));
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
        const {
          _tables,
          _matchSources,
          match_source: _matchSource,
          ...product
        } = row;
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

  const cap = maxProducts > 0 ? maxProducts : products.length;
  return {
    products: cap > 0 ? products.slice(0, cap) : products,
    tablesUsed: [...tablesUsed].sort(),
  };
}

async function searchProductsExtended(terms, parsed, limit) {
  const perStrategy = sqlLimit(Math.max(limit, 10));
  const [byStructured, byProduct, bySku, byCategory, byIndex] =
    await Promise.all([
      searchByStructuredQuery(parsed, perStrategy),
      searchByProductFields(terms, perStrategy),
      searchBySku(terms, perStrategy),
      searchByCategory(terms, perStrategy),
      searchBySearchIndex(terms, perStrategy),
    ]);

  return mergeSearchHits(
    [byStructured, byProduct, bySku, byCategory, byIndex],
    0
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
  TABLES.productSkus,
];

const PRICE_ONLY_RE =
  /^(jaka\s+)?cena\??$|ile\s+kosztuje|сколько\s+стоит|какая\s+цена|what('s|\s+is)\s+the\s+price/i;

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
    /\bdin\s*\d{3}/i.test(text)
  );
}

function isPriceOnlyQuery(text) {
  const t = String(text || "").trim();
  if (!t || hasHardwareSignals(t)) return false;
  if (PRICE_ONLY_RE.test(t)) return true;
  return t.length <= 30 && /cena|price|цен/i.test(t);
}

/**
 * Для «jaka cena?» подмешивает предыдущее сообщение с названием изделия.
 */
function buildEnrichSearchText(message, options = {}) {
  let text = String(message || "").trim();
  const history = options.chatHistory || options.history || [];

  if (!isPriceOnlyQuery(text)) return text;

  const priorTexts = [];
  const list = Array.isArray(history) ? history : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    const role = String(entry?.role || entry?.type || "").toLowerCase();
    if (role && !["user", "human"].includes(role)) continue;
    const content = historyMessageText(entry);
    if (!content || content === text) continue;
    if (hasHardwareSignals(content)) {
      priorTexts.unshift(content);
      break;
    }
  }

  if (priorTexts.length) {
    text = `${priorTexts.join("\n")}\n${text}`;
  }
  return text;
}

async function loadProductSkus(productIds) {
  const map = new Map();
  const ids = productIds
    .map((id) => parseInt(id, 10))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return map;

  const placeholders = ids.map(() => "?").join(",");
  const sql = `
    SELECT ${S.productId} AS product_id, ${S.sku} AS sku, ${S.name} AS sku_name,
           price, compare_price, count, available
    FROM ${TABLES.productSkus}
    WHERE ${S.productId} IN (${placeholders})
    ORDER BY ${S.productId}, sort ASC
    LIMIT 100
  `;
  const rows = await query(sql, ids);
  for (const row of rows) {
    const pid = row.product_id;
    if (!map.has(pid)) map.set(pid, []);
    const arr = map.get(pid);
    if (arr.length < 5) arr.push(row);
  }
  return map;
}

function buildProductExcerpt(product, featureLines, skuRows, baseUrl) {
  const name = product.name || `Товар #${product.id}`;
  const url = buildProductUrl(
    baseUrl,
    product.category_url,
    product.product_url
  );
  const priceStr = formatPrice(product.price, product.currency);
  const compareStr =
    product.compare_price && Number(product.compare_price) > 0
      ? formatPrice(product.compare_price, product.currency)
      : "";
  const summary = htmlToPlainText(product.summary || "");
  const description = htmlToPlainText(product.description || "");
  let body = summary || description || name;
  if (body.length > MAX_EXCERPT_CHARS) {
    body = body.slice(0, MAX_EXCERPT_CHARS) + "...";
  }

  const lines = [
    `[Каталог · ${baseUrl.replace(/^https?:\/\//, "")}] ${name}`,
    `ID товара (shop_product.id): ${product.id}`,
    product.category_name ? `Категория: ${product.category_name}` : null,
    priceStr ? `Цена: ${priceStr}` : null,
    compareStr ? `Старая цена: ${compareStr}` : null,
    product.currency ? `Валюта: ${product.currency}` : null,
    `Ссылка: ${url}`,
  ].filter(Boolean);

  if (skuRows?.length) {
    lines.push("SKU (shop_product_skus):");
    for (const sk of skuRows) {
      const skuPrice = formatPrice(sk.price, product.currency);
      lines.push(
        `  · ${sk.sku || sk.sku_name}${skuPrice ? ` — ${skuPrice}` : ""}` +
          (sk.count != null ? `, остаток: ${sk.count}` : "")
      );
    }
  }

  if (featureLines.length) {
    lines.push("Характеристики (shop_product_features):");
    lines.push(...featureLines.map((l) => `  · ${l}`));
  }
  if (body && body !== name) lines.push(`Описание: ${body}`);
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
    const searchText = buildEnrichSearchText(message, options);
    const parsed = parseHardwareQuery(searchText);
    const terms = extractSearchTerms(searchText);
    const searchTerms =
      terms.length > 0 ? terms : [String(searchText).trim().slice(0, 120)];

    console.log("[ShopDB] enrich start", {
      messageLen: message.length,
      searchTextLen: searchText.length,
      terms: searchTerms,
      parsed,
      maxDocs,
    });

    let { products: rawMerged, tablesUsed: searchTables } =
      await searchProductsExtended(searchTerms, parsed, maxDocs * 3);

    let agentStrategies = [];
    if (shopDbSearchAgentEnabled()) {
      const agentResult = await runShopDbSearchAgent({
        searchText,
        parsed,
        existingProducts: rawMerged,
        limit: maxDocs * 3,
        workspace: options.workspace || null,
      });
      if (agentResult.products.length) {
        rawMerged = agentResult.products;
        agentStrategies = agentResult.strategies || [];
      }
    }

    const ranked = rankProducts(rawMerged, searchTerms, parsed).slice(
      0,
      maxDocs
    );
    const productIds = ranked.map((p) => p.id);
    const [featureMap, skuMap] = await Promise.all([
      loadFeatureLines(productIds),
      loadProductSkus(productIds),
    ]);
    const baseUrl = getShopBaseUrl();

    const allTablesUsed = new Set(searchTables);
    for (const t of FEATURE_TABLES) allTablesUsed.add(t);

    const contextTexts = [];
    const sources = [];

    for (const product of ranked) {
      const featureLines = featureMap.get(product.id) || [];
      const skuRows = skuMap.get(product.id) || [];
      const productTables = [
        ...new Set([...product.shopDbTables, ...FEATURE_TABLES]),
      ].sort();
      for (const t of productTables) allTablesUsed.add(t);

      const { name, url, excerpt, body } = buildProductExcerpt(
        product,
        featureLines,
        skuRows,
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
      "structured",
      "product_fields",
      "sku",
      "category",
      "search_index",
      ...agentStrategies,
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

module.exports = {
  shopDbEnrichEnabled,
  getShopDbContext,
  buildEnrichSearchText,
  extractSearchTerms,
  buildShopDbTablesFooter,
  ENRICH_TABLES,
};
