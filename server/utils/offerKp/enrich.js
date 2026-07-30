/**
 * Обогащение контекста чата товарами из MySQL (Webasyst Shop-Script).
 */

const { v4: uuidv4 } = require("uuid");
const {
  query,
  isShopDbConfigured,
  getShopDbTarget,
  formatShopDbConnectionHint,
} = require("./db/client");
const shopDbLog = require("./shopDbLog");
const { parseHardwareQuery, extractSearchTerms } = require("./hardwareQuery");
const {
  buildProductSearchText,
  runProductSearchAgent,
  hasHardwareSignals,
  extractSkuCodes,
  isPriceOnlyQuery,
  isOfferFollowUp,
  isCatalogRelayRequest,
  isCatalogListingRequest,
} = require("./productSearchAgent");
const { getShopBaseUrl, buildProductUrl } = require("./productUrl");
const {
  TABLES,
  ENRICH_TABLES,
  PRODUCT_COLUMNS: P,
  CATEGORY_COLUMNS: C,
  SKU_COLUMNS: S,
} = require("./db/schema");
const { parseInquiryText } = require("./parseInquiry");
const {
  matchInquiryToDraft,
  buildPendingDraftLine,
} = require("./matchInquiryLines");
const {
  STATUS,
  classifyProductMatch,
  detectAnalogIntent,
} = require("./analogRules");
const {
  configuredOptPriceCategoryId,
  resolveProductPrice,
} = require("./priceResolve");
const { OFFER_KP_INTENTS, routeOfferKpMessage } = require("./intentRouter");

const MAX_EXCERPT_CHARS = 2200;

const SHOP_DB_ENRICH_TIMEOUT_MS = Math.min(
  120000,
  Math.max(5000, parseInt(process.env.SHOP_DB_ENRICH_TIMEOUT_MS, 10) || 30000)
);

const FEATURE_TABLES = [
  TABLES.productFeatures,
  TABLES.feature,
  TABLES.featureValueVarchar,
  TABLES.featureValueDimension,
  TABLES.productSkus,
];

function shopDbEnrichEnabled() {
  const flag = (process.env.SHOP_DB_ENRICH || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(flag)) return false;
  if (["1", "true", "yes", "on"].includes(flag)) return isShopDbConfigured();
  return isShopDbConfigured();
}

function shouldRunShopEnrich(message, options = {}) {
  const parsedTexts = (options.parsedFileTexts || []).filter(Boolean);
  const combined = [parsedTexts.join("\n"), String(message || "").trim()]
    .filter(Boolean)
    .join("\n");
  if (!combined) return false;

  // Prefer immutable IntentDecision from upstream (AUDYT split-brain fix).
  const routed =
    options.resolvedIntent && options.resolvedIntent.primaryIntent
      ? options.resolvedIntent
      : routeOfferKpMessage(String(message || "").trim());

  if (routed.primaryIntent === OFFER_KP_INTENTS.DATA_QUESTION) {
    return true;
  }
  if (routed.policy?.allowShopDbSearch) {
    return true;
  }

  // A short follow-up such as "какая цена?" is ambiguous in isolation and may
  // be routed out_of_scope, but it is a catalog query when recent user history
  // contains a product/SKU. Resolve that context before applying blocked intents.
  const searchText = buildProductSearchText(message, options);
  if (
    isPriceOnlyQuery(String(message || "").trim()) &&
    (hasHardwareSignals(searchText) || extractSkuCodes(searchText).length)
  ) {
    return true;
  }

  const blockedIntents = new Set([
    OFFER_KP_INTENTS.CASUAL_OR_TEST,
    OFFER_KP_INTENTS.SYSTEM_HELP,
    OFFER_KP_INTENTS.DOCUMENT_QUESTION,
    OFFER_KP_INTENTS.UNSAFE_OR_FORBIDDEN,
    OFFER_KP_INTENTS.OUT_OF_SCOPE,
  ]);
  if (blockedIntents.has(routed.primaryIntent)) {
    return false;
  }

  if (parsedTexts.length) {
    const inquiryLines = parseInquiryText(combined);
    if (inquiryLines.length || hasHardwareSignals(combined)) return true;
  }

  if (hasHardwareSignals(searchText)) return true;
  if (extractSkuCodes(combined).length) return true;
  if (isPriceOnlyQuery(String(message || "").trim())) return true;
  if (detectAnalogIntent(String(message || "").trim())) return true;
  if (detectAnalogIntent(combined)) return true;
  if (isCatalogRelayRequest(String(message || "").trim())) return true;
  if (isCatalogListingRequest(String(message || "").trim())) return true;
  if (isOfferFollowUp(String(message || "").trim())) return true;
  if (parsedTexts.length && isOfferFollowUp(combined)) return true;
  if (/извлек|pdf|коммерческ|\bкп\b|оферт/i.test(combined)) return true;

  return false;
}

function htmlToPlainText(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPrice(price, currency) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return "";
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
    SELECT pf.product_id, f.name AS feature_name,
           COALESCE(
             v.value,
             NULLIF(TRIM(CONCAT(CAST(d.value AS CHAR), ' ', COALESCE(d.unit, ''))), '')
           ) AS feature_value
    FROM ${TABLES.productFeatures} pf
    INNER JOIN ${TABLES.feature} f ON f.id = pf.feature_id
    LEFT JOIN ${TABLES.featureValueVarchar} v
      ON f.type = 'varchar' AND v.id = pf.feature_value_id
    LEFT JOIN ${TABLES.featureValueDimension} d
      ON f.type LIKE 'dimension.%' AND d.id = pf.feature_value_id
    WHERE pf.product_id IN (${placeholders})
      AND (v.id IS NOT NULL OR d.id IS NOT NULL)
    ORDER BY pf.product_id, f.name
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
  const optCategoryId = configuredOptPriceCategoryId();
  const optJoin = optCategoryId
    ? `LEFT JOIN shop_opt_prices op
         ON op.sku_id = s.id AND op.user_category_id = ?`
    : "";
  const optSelect = optCategoryId
    ? "op.price AS opt_price"
    : "NULL AS opt_price";
  const sql = `
    SELECT s.${S.productId} AS product_id, s.${S.sku} AS sku,
           s.${S.name} AS sku_name, s.price, s.compare_price,
           s.count, s.available, ${optSelect}
    FROM ${TABLES.productSkus} s
    ${optJoin}
    WHERE s.${S.productId} IN (${placeholders})
    ORDER BY s.${S.productId}, s.sort ASC
  `;
  const rows = await query(sql, optCategoryId ? [optCategoryId, ...ids] : ids);
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
  let url = buildProductUrl(baseUrl, product.category_url, product.product_url);
  try {
    const { isFabricatedShopUrl } = require("./groundedResponse");
    if (isFabricatedShopUrl(url)) url = "";
  } catch {
    if (/\/product\//i.test(String(url || ""))) url = "";
  }
  const effectivePrice = resolveProductPrice(
    product,
    skuRows,
    skuRows.map((row) => ({ price: row.opt_price }))
  );
  const priceStr = formatPrice(effectivePrice, product.currency);
  const compareStr =
    effectivePrice > 0 &&
    product.compare_price &&
    Number(product.compare_price) > effectivePrice
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
    url ? `Ссылка: ${url}` : null,
  ].filter(Boolean);

  // Clickable title for chat markdown (linkify also covers bare Ссылка URL).
  if (url && /^https?:\/\//i.test(url)) {
    const safe = String(name).replace(/\[/g, "(").replace(/\]/g, ")");
    lines[0] = `[Каталог · ${baseUrl.replace(/^https?:\/\//, "")}] [${safe}](${url})`;
  }

  if (skuRows?.length) {
    const { sanitizeSku } = require("./fabricatedSku");
    const skuLines = [];
    for (const sk of skuRows) {
      const code = sanitizeSku(sk.sku || sk.sku_name);
      if (!code) continue;
      const skuPrice = formatPrice(sk.price, product.currency);
      skuLines.push(
        `  · ${code}${skuPrice ? ` — ${skuPrice}` : ""}` +
          (sk.count != null ? `, остаток: ${sk.count}` : "")
      );
    }
    if (skuLines.length) {
      lines.push("SKU (shop_product_skus):");
      lines.push(...skuLines);
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

async function loadProductRows(productIds = []) {
  const ids = [
    ...new Set(
      productIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(() => "?").join(",");
  const rows = await query(
    `SELECT p.${P.id} AS id, p.${P.name} AS name, p.${P.summary} AS summary,
            p.${P.description} AS description, p.${P.price} AS price,
            p.${P.currency} AS currency, p.${P.url} AS product_url,
            c.${C.name} AS category_name, c.${C.fullUrl} AS category_url
     FROM ${TABLES.product} p
     LEFT JOIN ${TABLES.category} c
       ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
     WHERE p.${P.id} IN (${placeholders}) AND p.${P.status} = 1`,
    ids
  );
  for (const row of rows) map.set(Number(row.id), row);
  return map;
}

function buildInquiryCatalogExcerpt(
  product,
  featureLines,
  skuRows,
  baseUrl,
  matched
) {
  const { excerpt, name, url, body } = buildProductExcerpt(
    product,
    featureLines,
    skuRows,
    baseUrl
  );
  const lines = excerpt.split("\n");
  lines[0] = `[Каталог · purolat.com · PDF] ${name}`;
  if (matched.requestedName && matched.requestedName !== matched.name) {
    lines.splice(1, 0, `Запрошено в PDF: ${matched.requestedName}`);
  }
  if (matched.status && matched.status !== STATUS.IN_STOCK) {
    lines.splice(
      lines.findIndex((l) => l.startsWith("ID")) || 1,
      0,
      `Статус: ${matched.status}${matched.analogOf ? ` (${matched.analogOf})` : ""}`
    );
  }
  const priceIdx = lines.findIndex((l) => l.startsWith("Цена:"));
  if (priceIdx >= 0) {
    lines.splice(
      priceIdx + 1,
      0,
      `Кол-во по заявке: ${matched.quantity || 1} ${matched.unit || "шт"}`
    );
  }
  return { excerpt: lines.join("\n"), name, url, body };
}

/**
 * Построчный поиск в ShopDB по позициям из PDF/заявки (matchInquiry + аналоги).
 * Не запускается для product_search / compare Q&A без файла — иначе «Сравни DIN…»
 * превращается в черновик КП.
 */
async function enrichInquiryLinesFromPdf(message, options = {}) {
  const parsedFileTexts = (options.parsedFileTexts || []).filter(Boolean);
  const intent = options.resolvedIntent?.primaryIntent || null;
  const text = String(message || "").trim();
  const compareOrSearchOnly =
    !parsedFileTexts.length &&
    (intent === OFFER_KP_INTENTS.PRODUCT_SEARCH ||
      intent === OFFER_KP_INTENTS.DATA_QUESTION ||
      (/(?:^|\s)(?:сравни|сверь|сравните|porównaj|compare)\b/iu.test(text) &&
        !/(?:кол-?во|количеств|\d+\s*(?:шт|штук|кг))/iu.test(text)));

  if (compareOrSearchOnly) {
    return {
      contextTexts: [],
      sources: [],
      productIds: new Set(),
      strategies: [],
      inquiryDraft: null,
    };
  }

  // «сделай кп» / Latin-c «cделай кп» is a command, not an RFQ product line.
  // Prefer attached file OCR; never invent a ShopDB stub from the command alone.
  let inquiryBody = text;
  try {
    const { isQuoteCommandOnly } = require("./quoteRequestPhrases");
    if (isQuoteCommandOnly(text)) {
      inquiryBody = "";
    }
  } catch {
    /* optional */
  }

  const combined = [parsedFileTexts.join("\n\n"), inquiryBody]
    .filter(Boolean)
    .join("\n\n");
  const lines = parseInquiryText(combined);
  if (!lines.length) {
    return {
      contextTexts: [],
      sources: [],
      productIds: new Set(),
      strategies: [],
    };
  }

  const INQUIRY_MAX_LINES = Math.max(
    1,
    Math.min(500, parseInt(process.env.OFFER_KP_INQUIRY_MAX_LINES, 10) || 200)
  );
  const maxLines = Math.min(INQUIRY_MAX_LINES, lines.length);
  const contextTexts = [];
  const sources = [];
  const productIds = new Set();
  const lineKeys = new Set();
  const baseUrl = getShopBaseUrl();
  const onProgress =
    typeof options.onProgress === "function" ? options.onProgress : null;

  if (onProgress) {
    const stubLines = lines
      .slice(0, maxLines)
      .map((line) => buildPendingDraftLine(line));
    onProgress({
      progressStage: "parsing",
      lineCount: maxLines,
      matchedCount: 0,
      total: maxLines,
      quoteDraft: {
        step: 2,
        hardwareLines: stubLines,
        preview: {
          lines: stubLines,
          subtotal: 0,
          total: 0,
          totalWeightKg: 0,
        },
      },
    });
  }

  const inquirySource = lines
    .slice(0, maxLines)
    .map((line) => line.raw)
    .join("\n");
  const inquiryDraft = await matchInquiryToDraft(inquirySource, {
    workspace: options.workspace,
    chatHistory: options.chatHistory || options.history || null,
    threadId: options.threadId || null,
    onProgress,
  });
  const matchedLines = inquiryDraft.lines || [];
  const matchedProductIds = matchedLines
    .map((line) => Number(line.productId))
    .filter((id) => Number.isInteger(id) && id > 0);
  const [productMap, featureMap, skuMap] = await Promise.all([
    loadProductRows(matchedProductIds),
    loadFeatureLines(matchedProductIds),
    loadProductSkus(matchedProductIds),
  ]);

  for (const matched of matchedLines) {
    if (!matched.productId) continue;

    const pid = parseInt(matched.productId, 10);
    // Одна позиция заявки = один блок, даже если productId повторяется
    // (раньше dedupe по pid схлопывал 40 строк в ~20 уникальных SKU).
    const lineKey = `${pid}:${matched.inquiryRaw || matched.requestedName || ""}:${matched.quantity || 1}`;
    if (lineKeys.has(lineKey)) continue;
    lineKeys.add(lineKey);
    productIds.add(pid);

    const product = productMap.get(pid) || {
      id: pid,
      name: matched.name,
      price: matched.unitPriceNet,
      currency: "RUB",
      product_url: matched.productUrl,
    };

    const { name, url, excerpt, body } = buildInquiryCatalogExcerpt(
      product,
      featureMap.get(pid) || [],
      skuMap.get(pid) || [],
      baseUrl,
      matched
    );

    const id = `shop-inquiry-${pid}-${uuidv4().slice(0, 8)}`;
    contextTexts.push(excerpt);
    sources.push({
      id,
      title: name,
      text: body.slice(0, 1000) + (body.length > 1000 ? "..." : ""),
      chunkSource: `link://${url}`,
      url,
      docSource: "Каталог · PDF",
      score: 1,
      shopProductId: pid,
      shopCategory: product.category_name || null,
      shopDbTables: [...FEATURE_TABLES],
      shopMatchSources: matched.matchType
        ? [matched.matchType, "inquiry_pdf"]
        : ["inquiry_pdf"],
    });
  }

  shopDbLog.ok("inquiry PDF enrich", {
    lines: lines.length,
    matched: contextTexts.length,
  });

  return {
    contextTexts,
    sources,
    productIds,
    inquiryDraft,
    strategies: contextTexts.length ? ["inquiry_pdf_lines"] : [],
  };
}

async function getShopDbContext(message, options = {}) {
  const analogIntent = detectAnalogIntent(String(message || ""));
  const maxDocs = Math.min(
    12,
    Math.max(1, parseInt(options.maxDocs, 10) || (analogIntent ? 10 : 5))
  );
  const parsedFileTexts = (options.parsedFileTexts || []).filter(Boolean);
  const effectiveMessage =
    String(message || "").trim() ||
    (parsedFileTexts.length
      ? "сформировать КП по прикреплённому документу"
      : "");

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

  if (!effectiveMessage) {
    shopDbLog.skip("enrich empty message");
    return {
      contextTexts: [],
      sources: [],
      flags: { shopDbSkippedEmptyMessage: true },
    };
  }

  if (!shouldRunShopEnrich(effectiveMessage, options)) {
    shopDbLog.skip("enrich skipped — not a catalog query", {
      messageLen: effectiveMessage.length,
    });
    return {
      contextTexts: [],
      sources: [],
      flags: { shopDbSkippedNotCatalog: true },
    };
  }

  const { getShopDbReadiness } = require("./shopDbReadiness");
  const readiness = await getShopDbReadiness();
  if (!readiness.ready) {
    const code = readiness.code || "INDEX_NOT_READY";
    shopDbLog.error("catalog readiness gate rejected request", {
      code,
      mysqlOk: readiness.mysqlOk,
      activeProducts: readiness.activeProducts,
      indexProductCount: readiness.indexProductCount,
      vectorCount: readiness.vectorCount,
      indexFresh: readiness.indexFresh,
      sync: readiness.sync,
    });
    return {
      contextTexts: [],
      sources: [],
      flags: {
        shopDbGateCode: code,
        shopDbUnavailable: code === "DB_UNAVAILABLE",
        shopDbIndexNotReady: code === "INDEX_NOT_READY",
        shopDbError: code === "DB_UNAVAILABLE",
        shopDbMessage: code,
        shopDbDocCount: 0,
        shopDbSearchHitCount: 0,
        shopDbReadiness: readiness,
      },
    };
  }

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("SHOP_DB_TIMEOUT")),
      SHOP_DB_ENRICH_TIMEOUT_MS
    )
  );

  /** Filled as soon as inquiry matching finishes — used on timeout (no full retry). */
  const partial = { inquiryEnrich: null };

  const runEnrich = async () => {
    const searchText = buildProductSearchText(effectiveMessage, options);

    shopDbLog.enrichStart({
      messageLen: effectiveMessage.length,
      searchTextLen: searchText.length,
      maxDocs,
      searchAgent: true,
      parsedFiles: parsedFileTexts.length,
      timeoutMs: SHOP_DB_ENRICH_TIMEOUT_MS,
    });

    const inquiryEnrich = await enrichInquiryLinesFromPdf(
      effectiveMessage,
      options
    );
    partial.inquiryEnrich = inquiryEnrich;

    // Multi-line RFQ: line-by-line matchInquiry already ran. A second
    // blob search over the whole paste OR-pollutes DIN/ISO/M-size signals
    // and burns the enrich timeout — skip it when we have ≥2 inquiry lines.
    const inquiryLineCount = Number(
      inquiryEnrich.inquiryDraft?.lines?.length ||
        inquiryEnrich.contextTexts?.length ||
        0
    );
    const skipBlobSearch = inquiryLineCount >= 2;
    const agentResult = skipBlobSearch
      ? {
          products: [],
          strategies: ["skipped_blob_after_inquiry_lines"],
          signals: { searchTerms: extractSearchTerms(searchText) },
          tablesUsed: [],
        }
      : await runProductSearchAgent({
          message: effectiveMessage,
          chatHistory: options.chatHistory || options.history || null,
          workspace: options.workspace || null,
          limit: maxDocs * 3,
          parsedFileTexts,
        });

    const inquiryIds = inquiryEnrich.productIds || new Set();
    const ranked = agentResult.products
      .filter((p) => !inquiryIds.has(Number(p.id)))
      .slice(0, maxDocs);
    const searchTerms =
      agentResult.signals?.searchTerms || extractSearchTerms(searchText);
    const searchTables = agentResult.tablesUsed || [];
    const shopDbMatchStrategies = [
      ...(inquiryEnrich.strategies || []),
      ...(agentResult.strategies || []),
    ];

    const productIds = ranked.map((p) => p.id);
    const [featureMap, skuMap] = await Promise.all([
      loadFeatureLines(productIds),
      loadProductSkus(productIds),
    ]);
    const baseUrl = getShopBaseUrl();

    const allTablesUsed = new Set(searchTables);
    for (const t of FEATURE_TABLES) allTablesUsed.add(t);

    const contextTexts = [...(inquiryEnrich.contextTexts || [])];
    const sources = [...(inquiryEnrich.sources || [])];
    const classifyAgainst = searchText || effectiveMessage;

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
      let catalogExcerpt = excerpt;
      const match = classifyProductMatch(classifyAgainst, {
        name: product.name,
        stockCount: skuRows?.[0]?.count ?? product.count,
        price: product.price,
      });
      if (
        match?.matchType &&
        match.matchType !== "none" &&
        (analogIntent ||
          match.matchType === "analog" ||
          match.matchType === "similar")
      ) {
        const statusLine = `Статус: ${match.status}${
          match.analogOf ? ` (${match.analogOf})` : ""
        } · тип: ${match.matchType}`;
        const lines = catalogExcerpt.split("\n");
        lines.splice(1, 0, statusLine);
        catalogExcerpt = lines.join("\n");
      }
      const id = `shop-${product.id}-${uuidv4().slice(0, 8)}`;

      contextTexts.push(catalogExcerpt);
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
        matchType: match?.matchType || null,
        analogOf: match?.analogOf || null,
      });
    }

    shopDbLog.enrichDone({
      hits: agentResult.products.length,
      selected: ranked.length + (inquiryEnrich.contextTexts?.length || 0),
      inquiryLines: inquiryEnrich.contextTexts?.length || 0,
      tables: [...allTablesUsed].sort(),
      strategies: shopDbMatchStrategies,
      productIds: [...inquiryIds, ...productIds],
      titles: sources.map((s) => s.title),
      urls: sources.map((s) => s.url),
    });

    const flags = {
      shopDbSearchHitCount:
        agentResult.products.length + (inquiryEnrich.contextTexts?.length || 0),
      shopDbDocCount: contextTexts.length,
      shopDbInquiryLineCount: inquiryEnrich.contextTexts?.length || 0,
      shopDbTerms: searchTerms,
      shopDbTablesUsed: [...allTablesUsed].sort(),
      shopDbMatchStrategies,
      shopDbTimeout: false,
      shopDbReadiness: readiness,
    };
    if (flags.shopDbSearchHitCount === 0) {
      flags.shopDbGateCode = "NO_MATCH";
      flags.shopDbNoMatch = true;
    }

    return {
      contextTexts,
      sources,
      inquiryDraft: inquiryEnrich.inquiryDraft || null,
      flags,
    };
  };

  try {
    return await Promise.race([runEnrich(), timeoutPromise]);
  } catch (e) {
    if (e?.message === "SHOP_DB_TIMEOUT") {
      const inquiryEnrich = partial.inquiryEnrich;
      if (inquiryEnrich?.inquiryDraft?.lines?.length) {
        shopDbLog.warn("enrich timeout — returning partial inquiry draft", {
          timeoutMs: SHOP_DB_ENRICH_TIMEOUT_MS,
          inquiryLines: inquiryEnrich.inquiryDraft.lines.length,
        });
        return {
          contextTexts: inquiryEnrich.contextTexts || [],
          sources: inquiryEnrich.sources || [],
          inquiryDraft: inquiryEnrich.inquiryDraft,
          flags: {
            shopDbTimeout: true,
            shopDbPartial: true,
            shopDbSearchHitCount: inquiryEnrich.contextTexts?.length || 0,
            shopDbDocCount: inquiryEnrich.contextTexts?.length || 0,
            shopDbInquiryLineCount: inquiryEnrich.contextTexts?.length || 0,
          },
        };
      }
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
    const target = getShopDbTarget();
    shopDbLog.enrichError(e, {
      target,
      code: e?.code,
      hint: formatShopDbConnectionHint({
        target,
        error: e?.message,
        code: e?.code,
      }),
    });
    return {
      contextTexts: [],
      sources: [],
      flags: {
        shopDbError: true,
        shopDbMessage: e?.message || String(e),
        shopDbTarget: target,
      },
    };
  }
}

module.exports = {
  shopDbEnrichEnabled,
  shouldRunShopEnrich,
  getShopDbContext,
  buildEnrichSearchText,
  buildProductSearchText,
  extractSearchTerms,
  parseHardwareQuery,
  buildShopDbTablesFooter,
  ENRICH_TABLES,
  loadFeatureLines,
};
