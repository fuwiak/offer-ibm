/**
 * Обогащение контекста чата товарами из MySQL (Webasyst Shop-Script).
 */

const { v4: uuidv4 } = require("uuid");
const { query, isShopDbConfigured } = require("./db/client");
const shopDbLog = require("./shopDbLog");
const { parseHardwareQuery, extractSearchTerms } = require("./hardwareQuery");
const {
  buildProductSearchText,
  runProductSearchAgent,
} = require("./productSearchAgent");
const {
  TABLES,
  ENRICH_TABLES,
  SKU_COLUMNS: S,
} = require("./db/schema");

const MAX_EXCERPT_CHARS = 2200;

const SHOP_DB_ENRICH_TIMEOUT_MS = Math.min(
  60000,
  Math.max(3000, parseInt(process.env.SHOP_DB_ENRICH_TIMEOUT_MS, 10) || 15000)
);

const FEATURE_TABLES = [
  TABLES.productFeatures,
  TABLES.feature,
  TABLES.featureValueVarchar,
  TABLES.productSkus,
];

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

/** @deprecated используйте buildProductSearchText из productSearchAgent */
function buildEnrichSearchText(message, options = {}) {
  return buildProductSearchText(message, options);
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
    shopDbLog.skip("enrich disabled", {
      configured: isShopDbConfigured(),
      SHOP_DB_ENRICH: process.env.SHOP_DB_ENRICH || "(unset)",
    });
    return {
      contextTexts: [],
      sources: [],
      flags: { shopDbSkipped: true, shopDbConfigured: isShopDbConfigured() },
    };
  }

  if (!message || typeof message !== "string" || !message.trim()) {
    shopDbLog.skip("enrich empty message");
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
    const searchText = buildProductSearchText(message, options);

    shopDbLog.enrichStart({
      messageLen: message.length,
      searchTextLen: searchText.length,
      maxDocs,
      searchAgent: true,
    });

    const agentResult = await runProductSearchAgent({
      message,
      chatHistory: options.chatHistory || options.history || null,
      workspace: options.workspace || null,
      limit: maxDocs * 3,
    });

    const ranked = agentResult.products.slice(0, maxDocs);
    const searchTerms = agentResult.signals?.searchTerms || extractSearchTerms(searchText);
    const searchTables = agentResult.tablesUsed || [];
    const shopDbMatchStrategies = agentResult.strategies || [];

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
        ...new Set([...(product.shopDbTables || []), ...FEATURE_TABLES]),
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

    shopDbLog.enrichDone({
      hits: agentResult.products.length,
      selected: ranked.length,
      tables: [...allTablesUsed].sort(),
      strategies: shopDbMatchStrategies,
      productIds: ranked.map((p) => p.id),
      titles: sources.map((s) => s.title),
    });

    return {
      contextTexts,
      sources,
      flags: {
        shopDbSearchHitCount: agentResult.products.length,
        shopDbDocCount: ranked.length,
        shopDbTerms: searchTerms,
        shopDbTablesUsed: [...allTablesUsed].sort(),
        shopDbMatchStrategies,
        shopDbTimeout: false,
      },
    };
  };

  try {
    return await Promise.race([runEnrich(), timeoutPromise]);
  } catch (e) {
    if (e?.message === "SHOP_DB_TIMEOUT") {
      shopDbLog.enrichTimeout({ timeoutMs: SHOP_DB_ENRICH_TIMEOUT_MS });
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
    shopDbLog.enrichError(e);
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
  buildProductSearchText,
  extractSearchTerms,
  parseHardwareQuery,
  buildShopDbTablesFooter,
  ENRICH_TABLES,
};
