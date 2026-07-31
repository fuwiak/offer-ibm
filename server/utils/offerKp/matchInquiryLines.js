/**
 * Сверка позиций заявки с каталогом и формирование строк черновика КП.
 */

const { query } = require("./db/client");
const { TABLES, SKU_COLUMNS: S } = require("./db/schema");
const { parseInquiryText } = require("./parseInquiry");
const {
  runProductSearchAgent,
  searchByExactSku,
} = require("./productSearchAgent");
const { classifyProductMatch, STATUS } = require("./analogRules");
const { generateQuoteReference } = require("../offerKpApp/pricing");
const priceResolve = require("./priceResolve");
const configuredOptPriceCategoryId =
  priceResolve.configuredOptPriceCategoryId || (() => null);
const resolveSkuRowPrice =
  priceResolve.resolveSkuRowPrice ||
  ((skuRow) => {
    if (!skuRow || typeof skuRow !== "object") {
      return { price: 0, source: null };
    }
    const n = Number(skuRow.price);
    if (Number.isFinite(n) && n > 0) {
      return { price: n, source: "shop_product_skus.price" };
    }
    const opt = Number(skuRow.opt_price);
    if (Number.isFinite(opt) && opt > 0) {
      return { price: opt, source: "shop_opt_prices.price" };
    }
    return { price: 0, source: null };
  });
const resolvePreferredSkuPrice =
  priceResolve.resolvePreferredSkuPrice ||
  ((skuRows, preferredSku) => {
    const wanted = String(preferredSku || "").trim();
    if (!wanted) {
      return {
        price: 0,
        source: null,
        sku: "",
        skuRow: null,
        skuMissing: false,
      };
    }
    const skuRow = (skuRows || []).find(
      (row) => String(row?.sku || "").trim() === wanted
    );
    if (!skuRow) {
      return {
        price: 0,
        source: null,
        sku: wanted,
        skuRow: null,
        skuMissing: true,
      };
    }
    const resolved = resolveSkuRowPrice(skuRow);
    return {
      price: resolved.price,
      source: resolved.source,
      sku: String(skuRow.sku || wanted).trim(),
      skuRow,
      skuMissing: false,
    };
  });
const { pickCheaperAmongSimilar } = require("./nameSimilarity");
const {
  signaturesMatchForPricing,
  buildProductSignature,
} = require("./canonicalProductText");
const { detectVariantAmbiguity, variantPricingKey } = require("./variantSpecs");
const { findGoldenCorrection } = require("./goldenCorrections");
const { sanitizeSku } = require("./fabricatedSku");
const { recordSearchMetric } = require("./searchMetrics");
const { withLineEvidence, MATCH_RULES_VERSION } = require("./matchEvidence");
const { assessInquiryCompleteness } = require("./inquiryCompleteness");
const { resolveReviewReason } = require("./reviewReasons");
const { enrichAlternatives, decideMatchGates } = require("./matching");
const { stripMessengerExportNoise } = require("./parseInquiry");
const { buildProductUrl, getShopBaseUrl } = require("./productUrl");
const {
  buildMatchIdentityCacheKey,
  getCachedMatchIdentity,
  setCachedMatchIdentity,
  getCachedCommercial,
  setCachedCommercial,
  applyCommercialFields,
  resolveIndexVersion,
} = require("./db/layeredCache");
const {
  getDurableMatchIdentity,
  setDurableMatchIdentity,
} = require("./db/durableMatchStore");
const { getCanonicalCatalogManifest } = require("./canonicalCatalogIndex");

const {
  DETERMINISTIC_MATCH_PROFILE,
  matchEnrichmentEnabled: matchEnrichmentEnabledFromProfile,
} = require("./matching/algorithmProfile");

function matchEnrichmentEnabled() {
  return matchEnrichmentEnabledFromProfile();
}

const VAT_RATE = Number(process.env.OFFER_KP_VAT_RATE || 0.2);

function lineMatchIdentityKey(threadId, raw) {
  return buildMatchIdentityCacheKey({
    inquiryText: `${threadId || "global"}::${raw || ""}`,
    indexVersion: resolveIndexVersion(getCanonicalCatalogManifest()),
  });
}

async function hydrateLineCommercial(line) {
  if (!line || typeof line !== "object") return line;
  const productId = line.productId != null ? String(line.productId).trim() : "";
  if (!productId || line.allowPrice === false) {
    return applyCommercialFields(line, {
      unitPriceNet: 0,
      priceWithVat: 0,
      allowPrice: false,
      retrievedAt: new Date().toISOString(),
    });
  }

  const preferredSku = String(line.article || line.sku || "").trim();
  // Cache key must include SKU — same productId with different sibling SKUs
  // must not share a cheapest-SKU commercial snapshot.
  const commercialKey = preferredSku
    ? `${productId}::${preferredSku}`
    : productId;
  let commercial = getCachedCommercial(commercialKey);
  if (!commercial) {
    const stock = await fetchProductStock(productId);
    let unitPriceNet = 0;
    let priceSource = null;
    let sku = preferredSku;
    let allowPrice = true;

    if (preferredSku) {
      const pinned = resolvePreferredSkuPrice(stock.skus || [], preferredSku);
      unitPriceNet = pinned.price;
      priceSource = pinned.source;
      sku = pinned.sku || preferredSku;
      // Missing / unpriced pinned SKU → no silent bestSku sibling.
      allowPrice = unitPriceNet > 0 && !pinned.skuMissing;
    } else {
      // No pinned article on identity line: keep product-level representative
      // SKU from fetchProductStocks (bestSku) for name-matched products only.
      unitPriceNet = Number(stock.price) || 0;
      priceSource = stock.priceSource || null;
      sku = stock.sku || "";
      allowPrice = unitPriceNet > 0;
    }

    commercial = {
      sku,
      unitPriceNet,
      priceWithVat: unitPriceNet
        ? Number((unitPriceNet * (1 + VAT_RATE)).toFixed(2))
        : 0,
      priceSource,
      stockCount: Number(stock.stockCount) || 0,
      allowPrice,
      retrievedAt: new Date().toISOString(),
    };
    setCachedCommercial(commercialKey, commercial);
  }
  return applyCommercialFields(line, commercial);
}

async function getCachedLineMatch(threadId, raw) {
  const key = lineMatchIdentityKey(threadId, raw);
  const ram = getCachedMatchIdentity(key);
  if (ram) return ram;

  const durable = await getDurableMatchIdentity(key);
  if (durable) {
    // Promote durable → RAM so subsequent lines in same request are free.
    setCachedMatchIdentity(key, durable);
    return durable;
  }
  return null;
}

async function setCachedLineMatch(threadId, raw, value) {
  const key = lineMatchIdentityKey(threadId, raw);
  setCachedMatchIdentity(key, value);
  await setDurableMatchIdentity(key, value).catch(() => false);
}

function resolveMatchConcurrency(lineCount) {
  const envCap = Number(process.env.OFFER_KP_MATCH_CONCURRENCY);
  if (Number.isFinite(envCap) && envCap > 0) {
    return Math.max(1, Math.min(16, envCap));
  }
  // Default 1 on tight hosts: parallel lines fan out ONNX embeds and caused
  // offer-kp SEGV (signal 11) mid-stream on Lainey. Raise via env if RAM OK.
  if (lineCount <= 1) return 1;
  return 1;
}

/**
 * Placeholder row right after parse — сводка shows all extracted lines
 * immediately; ShopDB fill replaces each index as matching completes.
 */
function buildPendingDraftLine(inquiryLine = {}) {
  const quantity = Number(inquiryLine.quantity);
  return withLineEvidence({
    inquiryRaw: inquiryLine.raw,
    name: inquiryLine.name || inquiryLine.raw || "",
    requestedName: inquiryLine.name || inquiryLine.raw || "",
    article: "",
    productId: "",
    quantity: Number.isFinite(quantity) ? quantity : 1,
    unit: inquiryLine.unit || "шт",
    priceWithVat: 0,
    unitPriceNet: 0,
    lineTotal: 0,
    weightKg: 0,
    lineWeightKg: 0,
    status: STATUS.NEEDS_REVIEW,
    kpStatus: "Поиск в каталоге…",
    unitNeedsRecalc: true,
    matchType: "none",
    analogOf: null,
    similarSuggestion: null,
    comment: "Распознано из заявки — идёт сопоставление с ShopDB",
    thread: inquiryLine.thread,
    alternatives: [],
    matchSource: "pending",
    pendingMatch: true,
    allowPrice: false,
    retrievedAt: new Date().toISOString(),
  });
}

function slimAlternativeForSse(alt = {}) {
  if (!alt || typeof alt !== "object") return null;
  return {
    productId: alt.productId || undefined,
    name: alt.name || "",
    sku: alt.sku || alt.article || "",
    price: alt.price ?? alt.unitPriceNet ?? 0,
    stockCount: alt.stockCount ?? 0,
    matchType: alt.matchType || undefined,
    status: alt.status || undefined,
    analogOf: alt.analogOf || undefined,
  };
}

/** Keep SSE quote-progress payloads small (avoids mid-stream network aborts). */
function slimLineForSse(line = {}, { includeAlternatives = false } = {}) {
  if (!line || typeof line !== "object") return line;
  const alternatives =
    includeAlternatives && Array.isArray(line.alternatives)
      ? line.alternatives.slice(0, 12).map(slimAlternativeForSse).filter(Boolean)
      : [];
  return {
    inquiryRaw: line.inquiryRaw,
    name: line.name,
    requestedName: line.requestedName,
    article: line.article || line.sku,
    sku: line.sku || line.article,
    productId: line.productId,
    quantity: line.quantity,
    unit: line.unit,
    priceWithVat: line.priceWithVat,
    unitPriceNet: line.unitPriceNet,
    lineTotal: line.lineTotal,
    weightKg: line.weightKg,
    lineWeightKg: line.lineWeightKg,
    status: line.status,
    kpStatus: line.kpStatus,
    matchType: line.matchType,
    analogOf: line.analogOf,
    comment: line.comment,
    allowPrice: line.allowPrice,
    operatorPriceOverride: line.operatorPriceOverride,
    pendingMatch: line.pendingMatch,
    alternatives,
  };
}

function draftProgressPayload(partialLines, { stage, completed, total }) {
  // During searching, omit alternatives entirely — UI only needs row fill state.
  const includeAlternatives = stage === "matched";
  const lines = partialLines
    .map((line) => line || buildPendingDraftLine({}))
    .map((line) => slimLineForSse(line, { includeAlternatives }));
  return {
    progressStage: stage,
    lineCount: total,
    matchedCount: completed,
    total,
    quoteDraft: {
      step: 2,
      hardwareLines: lines,
      preview: {
        lines,
        subtotal: 0,
        total: 0,
        totalWeightKg: 0,
      },
    },
  };
}

/**
 * Exact must be grounded. Retriever disagreement / missing productId must not
 * leave matchType=exact (InvalidExactState) — demote to none + NEEDS_REVIEW.
 */
function enforceExactGroundingContract(input = {}) {
  const matchType = input.matchType || "none";
  const productId = String(input.productId || "").trim();
  const disagreement = !!input.retrieverDisagreement;
  if (matchType === "exact" && (!productId || disagreement)) {
    return {
      matchType: "none",
      productId: "",
      status: STATUS.NEEDS_REVIEW,
      kpStatus: "Требуется проверка",
      allowPrice: false,
      demoted: true,
    };
  }
  return {
    matchType,
    productId,
    status: input.status,
    kpStatus: input.kpStatus,
    allowPrice: !!input.allowPrice,
    demoted: false,
  };
}

/**
 * Retrieval merge steps keep `_matchSources` as a Set (productSearchAgent /
 * shopDbSearch) while exposing `shopMatchSources` as an array. Metrics must
 * accept both: a Set here used to throw and turn every line into match_error.
 * @returns {string[]}
 */
function candidateMatchSources(candidate = {}) {
  const raw = candidate._matchSources || candidate.shopMatchSources || [];
  if (Array.isArray(raw)) return raw;
  if (raw instanceof Set) return [...raw];
  return [];
}

function positivePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

/**
 * Выбор кандидата для строки заявки.
 * Приоритет: exact → analog → in_stock → остальные.
 * Дешёвый SKU — только среди одинаковой технической сигнтуры (не M10x70 vs M10x80).
 */
function exactCatalogNameKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestInquiryAlternative(alternatives = [], queryText = "") {
  const list = (alternatives || []).filter(Boolean).map((alt) => ({
    ...alt,
    _signature:
      alt._signature ||
      alt.signature ||
      buildProductSignature({ name: alt.name, id: alt.productId || alt.id }),
  }));
  if (!list.length) return null;

  const queryNameKey = exactCatalogNameKey(queryText);
  if (queryNameKey) {
    const literalExact = list.find(
      (candidate) =>
        candidate.matchType === "exact" &&
        exactCatalogNameKey(candidate.name) === queryNameKey
    );
    if (literalExact) return literalExact;
  }

  const byType = (type) => list.filter((a) => a.matchType === type);
  const exact = byType("exact");
  const analogs = byType("analog");
  const inStock = list.filter((a) => a.status === STATUS.IN_STOCK);
  const usable = list.filter(
    (a) =>
      a.matchType !== "none" &&
      a.matchType !== "size_mismatch" &&
      a.matchType !== "size_unconfirmed"
  );

  const pool = exact.length
    ? exact
    : analogs.length
      ? analogs
      : inStock.length
        ? inStock
        : usable;

  if (!pool.length) return null;
  if (pool.length === 1) return pool[0];

  // Среди exact/analog одной сигнтуры — берём дешевле (покрытие и т.п.).
  if (exact.length || analogs.length) {
    const pricedPool = pool.filter((candidate) =>
      positivePrice(candidate.price)
    );
    const candidates = pricedPool.length ? pricedPool : pool;

    // Group by signature identity; pick cheapest inside the top signature group.
    const groups = [];
    for (const candidate of candidates) {
      let placed = false;
      for (const group of groups) {
        if (
          signaturesMatchForPricing(
            group[0]._signature,
            candidate._signature
          ) &&
          variantPricingKey(group[0].name) === variantPricingKey(candidate.name)
        ) {
          group.push(candidate);
          placed = true;
          break;
        }
      }
      if (!placed) groups.push([candidate]);
    }
    // Prefer the group that appears first in ranked pool (identity already decided).
    const primaryGroup = groups[0] || candidates;
    const byPrice = [...primaryGroup].sort((a, b) => {
      const aPrice = positivePrice(a.price);
      const bPrice = positivePrice(b.price);
      if (!aPrice && !bPrice) {
        return (
          String(a.sku || "").localeCompare(String(b.sku || "")) ||
          Number(a.id || 0) - Number(b.id || 0)
        );
      }
      if (!aPrice) return 1;
      if (!bPrice) return -1;
      if (aPrice !== bPrice) return aPrice - bPrice;
      return (
        String(a.sku || "").localeCompare(String(b.sku || "")) ||
        Number(a.id || 0) - Number(b.id || 0)
      );
    });
    return (
      pickCheaperAmongSimilar(byPrice, {
        getPrice: (a) => positivePrice(a.price),
      }) || byPrice[0]
    );
  }

  // Без точного совпадения — не брать «самый дешёвый любой болт».
  return pool[0];
}

async function fetchProductStock(productId) {
  const stockByProduct = await fetchProductStocks([productId]);
  return stockByProduct.get(String(productId)) || emptyProductStock();
}

function emptyProductStock() {
  return {
    sku: "",
    skuId: null,
    skuName: "",
    price: 0,
    priceSource: null,
    optPriceRows: [],
    stockCount: 0,
    skus: [],
  };
}

function skuPositivePrice(sku = {}) {
  return positivePrice(sku.price);
}

function isSkuInStock(sku = {}) {
  return Number(sku.available) !== 0 && Number(sku.count) > 0;
}

/**
 * Prefer the cheapest positive-price SKU that is actually in stock. A zero
 * price is an unknown price and is considered only when no priced SKU exists.
 */
function pickBestPricedSku(skus = []) {
  const rows = (skus || []).filter(Boolean);
  if (!rows.length) return null;

  const cheapest = (candidates) =>
    [...candidates].sort((a, b) => {
      const priceDelta = skuPositivePrice(a) - skuPositivePrice(b);
      if (priceDelta) return priceDelta;
      const countDelta = (Number(b.count) || 0) - (Number(a.count) || 0);
      if (countDelta) return countDelta;
      return String(a.sku || "").localeCompare(String(b.sku || ""));
    })[0];

  const pricedInStock = rows.filter(
    (sku) => isSkuInStock(sku) && skuPositivePrice(sku) > 0
  );
  if (pricedInStock.length) return cheapest(pricedInStock);

  const pricedAvailable = rows.filter(
    (sku) => Number(sku.available) !== 0 && skuPositivePrice(sku) > 0
  );
  if (pricedAvailable.length) return cheapest(pricedAvailable);

  const priced = rows.filter((sku) => skuPositivePrice(sku) > 0);
  if (priced.length) return cheapest(priced);

  return [...rows].sort(
    (a, b) =>
      (Number(b.count) || 0) - (Number(a.count) || 0) ||
      String(a.sku || "").localeCompare(String(b.sku || ""))
  )[0];
}

async function fetchProductStocks(productIds = []) {
  const ids = [
    ...new Set(
      productIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  const byProduct = new Map();
  if (!ids.length) return byProduct;

  const placeholders = ids.map(() => "?").join(",");
  const optCategoryId = configuredOptPriceCategoryId();
  const optJoin = optCategoryId
    ? `LEFT JOIN shop_opt_prices op
         ON op.sku_id = s.id AND op.user_category_id = ?`
    : "";
  const optSelect = optCategoryId
    ? "op.price AS opt_price"
    : "NULL AS opt_price";
  const rows = await query(
    `SELECT s.id AS sku_id, s.${S.productId} AS product_id, s.${S.sku} AS sku,
            s.${S.name} AS sku_name, s.price, s.compare_price,
            s.count, s.available, ${optSelect}
     FROM ${TABLES.productSkus} s
     ${optJoin}
     WHERE s.${S.productId} IN (${placeholders})
     ORDER BY s.${S.productId}, s.count DESC, s.${S.sku} ASC`,
    optCategoryId ? [optCategoryId, ...ids] : ids
  );

  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.product_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  for (const id of ids) {
    const key = String(id);
    const skus = grouped.get(key) || [];
    const totalStock = skus.reduce(
      (sum, row) => sum + (Number(row.count) || 0),
      0
    );
    const bestSku = pickBestPricedSku(skus) || {};
    // Price MUST come from the chosen SKU row — never from another variant.
    const resolved = resolveSkuRowPrice(bestSku);
    byProduct.set(key, {
      sku: bestSku.sku || "",
      skuId: bestSku.sku_id != null ? Number(bestSku.sku_id) : null,
      skuName: bestSku.sku_name || "",
      price: resolved.price,
      priceSource: resolved.source,
      optPriceRows: skus
        .filter((row) => Number(row.opt_price) > 0)
        .map((row) => ({ price: row.opt_price, sku_id: row.sku_id })),
      stockCount: totalStock,
      skus,
    });
  }
  return byProduct;
}

// Строка-заглушка для позиции, на которой сопоставление упало с ошибкой
// (например, обрыв соединения с MySQL). Ошибка ОДНОЙ строки не должна
// обнулять цены всей котировки — см. matchInquiryToDraft.
function buildLineMatchErrorFallback(inquiryLine, error) {
  const quantity = Number(inquiryLine.quantity);
  console.error(
    `[offerKp] matchInquiryLine failed for "${inquiryLine.raw}":`,
    error?.message || error
  );
  recordSearchMetric({
    matchType: "error",
    source: "exception",
    strategies: [],
    hasPrice: false,
    candidateCount: 0,
    queryLen: String(inquiryLine.raw || "").length,
    threadId: null,
  });
  return withLineEvidence({
    inquiryRaw: inquiryLine.raw,
    name: inquiryLine.name || inquiryLine.raw,
    requestedName: inquiryLine.name || inquiryLine.raw,
    article: "",
    productId: "",
    quantity: Number.isFinite(quantity) ? quantity : 1,
    unit: inquiryLine.unit || "шт",
    priceWithVat: 0,
    unitPriceNet: 0,
    lineTotal: 0,
    weightKg: 0,
    lineWeightKg: 0,
    status: STATUS.NEEDS_REVIEW,
    kpStatus: "Требуется проверка",
    unitNeedsRecalc: true,
    matchType: "none",
    analogOf: null,
    similarSuggestion: null,
    comment:
      "Ошибка при проверке базы данных для этой позиции — требуется повторная проверка",
    thread: inquiryLine.thread,
    alternatives: [],
    matchError: true,
    reviewReason: "match_error",
    mismatchReason: "match_error",
    matchSource: "exception",
    matchStrategies: [],
    retrievedAt: new Date().toISOString(),
    allowPrice: false,
  });
}

/**
 * Compare top-1 by lexical vs embedding scores when both are present.
 * Disagreement → do not allow automatic exact (operator must confirm).
 */
function detectRetrieverDisagreement(candidates = []) {
  const scored = (candidates || []).filter(
    (c) =>
      c &&
      typeof c === "object" &&
      (Number.isFinite(c._nameSimilarity) ||
        Number.isFinite(c._embeddingSimilarity))
  );
  if (scored.length < 2) return null;

  const byLex = [...scored].sort(
    (a, b) =>
      (b._nameSimilarity || 0) - (a._nameSimilarity || 0) ||
      Number(a.id || 0) - Number(b.id || 0)
  );
  const byEmb = [...scored].sort(
    (a, b) =>
      (b._embeddingSimilarity || 0) - (a._embeddingSimilarity || 0) ||
      Number(a.id || 0) - Number(b.id || 0)
  );
  const lexTop = byLex[0];
  const embTop = byEmb[0];
  if (!lexTop || !embTop) return null;
  if ((lexTop._nameSimilarity || 0) < 0.2) return null;
  if ((embTop._embeddingSimilarity || 0) < 0.45) return null;
  if (String(lexTop.id) === String(embTop.id)) return null;
  return {
    lexicalProductId: String(lexTop.id),
    embeddingProductId: String(embTop.id),
  };
}

function buildUnderspecifiedLine(inquiryLine, completeness) {
  const quantity = Number(inquiryLine.quantity);
  const missing = completeness.missing || [];
  const retrievedAt = new Date().toISOString();
  recordSearchMetric({
    matchType: "none",
    source: "underspecified",
    strategies: ["min_info_policy"],
    hasPrice: false,
    candidateCount: 0,
    queryLen: String(inquiryLine.raw || inquiryLine.name || "").length,
    threadId: null,
    failureReason: "underspecified",
    missingAttributes: missing,
  });
  return withLineEvidence({
    inquiryRaw: inquiryLine.raw,
    name: inquiryLine.name || inquiryLine.raw,
    requestedName: inquiryLine.name || inquiryLine.raw,
    article: "",
    productId: "",
    quantity: Number.isFinite(quantity) ? quantity : 1,
    unit: inquiryLine.unit || "шт",
    priceWithVat: 0,
    unitPriceNet: 0,
    lineTotal: 0,
    weightKg: 0,
    lineWeightKg: 0,
    status: STATUS.NEEDS_REVIEW,
    kpStatus: "Требуется проверка",
    unitNeedsRecalc: true,
    matchType: "none",
    analogOf: null,
    similarSuggestion: null,
    comment: `Недостаточно данных для сопоставления (нет: ${missing.join(", ")}). Укажите размер/стандарт — цена не назначена.`,
    thread: inquiryLine.thread,
    alternatives: [],
    reviewReason: "underspecified",
    mismatchReason: "underspecified",
    missingAttributes: missing,
    matchSource: "min_info_policy",
    matchStrategies: ["min_info_policy"],
    retrievedAt,
    allowPrice: false,
  });
}

async function matchInquiryLine(inquiryLine, options = {}) {
  if (!inquiryLine || typeof inquiryLine !== "object") {
    return buildLineMatchErrorFallback(
      { raw: "", name: "", quantity: 1 },
      new Error("null inquiry line")
    );
  }
  const cacheRaw = inquiryLine.raw || inquiryLine.name;
  const cached = await getCachedLineMatch(options.threadId, cacheRaw);
  if (cached) {
    return hydrateLineCommercial({
      ...cached,
      quantity: inquiryLine.quantity || cached.quantity,
    });
  }

  const searchText = stripMessengerExportNoise(
    inquiryLine.raw || inquiryLine.name
  );
  const completeness = assessInquiryCompleteness({
    ...inquiryLine,
    raw: searchText,
    name: searchText,
  });
  // Empty of catalog signals → abstain before any ShopDB round-trip.
  if (
    !completeness.ok &&
    completeness.missing.includes("product_signal") &&
    !completeness.hasSku
  ) {
    const line = buildUnderspecifiedLine(inquiryLine, completeness);
    await setCachedLineMatch(options.threadId, cacheRaw, line);
    return line;
  }

  // Golden-set override (test_files/*.expected.csv with matched_sku/match_type
  // columns filled in): an operator-confirmed answer for this exact line text
  // beats live search — see goldenCorrections.js.
  // Also accept pasted expected.csv rows that already carry matched_sku.
  let override = findGoldenCorrection([inquiryLine.raw, inquiryLine.name]);
  if (!override?.sku && inquiryLine.sku && String(inquiryLine.sku).trim()) {
    const hint = String(inquiryLine.matchTypeHint || "").toLowerCase();
    override = {
      sourceName: inquiryLine.name || inquiryLine.raw,
      sku: String(inquiryLine.sku).trim(),
      matchedName: null,
      matchType:
        hint === "analog" || hint === "exact" || hint === "none"
          ? hint
          : "exact",
      sourceFile: "pasted_expected_csv",
    };
  }
  let overrideProductId = null;
  let products = [];
  let matchStrategies = [];
  // Confirmed by golden set: no catalog product for this exact line — skip
  // the search entirely instead of risking a fresh false positive. A
  // positive override (exact/analog) only skips the search once its SKU
  // actually resolves live; if the product was since removed from the
  // catalog, fall through to the normal search below instead of silently
  // returning "no match".
  let skipSearch = override?.matchType === "none";
  if (skipSearch) matchStrategies.push("golden_override_none");

  if (override?.sku) {
    const hits = await searchByExactSku([override.sku], 1);
    if (hits.length) {
      overrideProductId = String(hits[0].id);
      products = hits;
      skipSearch = true;
      matchStrategies = ["golden_override"];
    }
  }

  if (!skipSearch) {
    ({ products, strategies: matchStrategies = [] } =
      await runProductSearchAgent({
        message: searchText,
        chatHistory: options.chatHistory,
        workspace: options.workspace,
        limit: 100,
        // A single inquiry line must be ranked on its own. Prepending the complete
        // PDF made every line share almost the same search text and candidates.
        parsedFileTexts: null,
      }));

    if (!products.length) {
      const {
        runShopDbSearchAgent,
        shopDbSearchAgentEnabled,
      } = require("./searchAgent");
      const { parseHardwareQuery } = require("./hardwareQuery");
      if (shopDbSearchAgentEnabled()) {
        const fallback = await runShopDbSearchAgent({
          searchText,
          parsed: parseHardwareQuery(searchText),
          existingProducts: [],
          limit: 100,
          workspace: options.workspace,
        });
        products = fallback.products || [];
        matchStrategies = [...matchStrategies, ...(fallback.strategies || [])];
      }
    }
  }

  // Stock lookup is already batched, so validate the full retrieval window.
  // Truncating it early could hide the correct SKU before Top-10 rerank.
  // Drop null/invalid hits — sparse merge arrays have caused
  // `Cannot read properties of null (reading 'name')` downstream.
  const candidates = (products || [])
    .filter((p) => p && typeof p === "object" && p.id != null)
    .slice(0, 100);
  const retrieverDisagreement = detectRetrieverDisagreement(candidates);
  const stockByProduct = await fetchProductStocks(candidates.map((p) => p.id));
  let alternatives = candidates.map((product) => {
    const stock = stockByProduct.get(String(product.id)) || emptyProductStock();
    const isOverrideMatch = overrideProductId === String(product.id);
    // Exact/golden SKU owns the price. Never price a sibling cheapest SKU.
    const preferredSku = String(
      product.matched_sku || (isOverrideMatch ? override?.sku : "") || ""
    ).trim();

    let altSku = stock.sku || "";
    let resolvedPrice;
    if (preferredSku) {
      const pinned = resolvePreferredSkuPrice(stock.skus || [], preferredSku);
      resolvedPrice = {
        price: pinned.price,
        source: pinned.source,
      };
      altSku = pinned.sku || preferredSku;
    } else {
      // Name-level product hit without a pinned SKU: use the product's
      // representative stock row (already bound to one SKU in fetchProductStocks).
      resolvedPrice = {
        price: Number(stock.price) || 0,
        source: stock.priceSource || null,
      };
    }

    const classification = classifyProductMatch(searchText, {
      ...product,
      ...stock,
      // Surface the pinned SKU to classifiers that read product.sku.
      sku: altSku || stock.sku,
    });
    const matchType = isOverrideMatch
      ? override.matchType
      : classification.matchType;
    let status = classification.status;
    let mismatchReason = classification.mismatchReason || null;
    let analogOf = classification.analogOf;
    // Operator-verified golden SKU: keep matchType, drop residual heuristic
    // mismatch (e.g. 8.8→10.9 analog) so price + chat cards stay eligible.
    if (isOverrideMatch && (matchType === "exact" || matchType === "analog")) {
      mismatchReason = null;
      if (matchType === "analog") {
        status = STATUS.ANALOG;
        analogOf = analogOf || inquiryLine.name || searchText;
      } else if (Number(stock.stockCount) > 0) {
        status = STATUS.IN_STOCK;
      }
    }
    return {
      productId: String(product.id),
      name: product.name || "",
      sku: altSku,
      price: resolvedPrice.price || 0,
      priceSource: resolvedPrice.source || null,
      stockCount: stock.stockCount,
      matchType,
      status,
      analogOf,
      mismatchReason,
      productUrl: buildProductUrl(
        getShopBaseUrl(),
        product.category_url,
        product.product_url || product.url
      ),
      matchSource: isOverrideMatch ? "golden_override" : undefined,
      _bm25Score: product._bm25Score ?? null,
      _nameSimilarity: product._nameSimilarity ?? null,
      _embeddingSimilarity: product._embeddingSimilarity ?? null,
      _rrfScore: product._rrfScore ?? null,
      _signatureHard: product._signatureHard || [],
    };
  });

  const underspecifiedSize =
    !completeness.ok &&
    (completeness.missing.includes("size") ||
      completeness.missing.includes("length"));

  let enrichmentMeta = null;
  if (matchEnrichmentEnabled() && alternatives.length) {
    const enriched = enrichAlternatives({
      queryText: searchText,
      alternatives,
      products: candidates,
      matchStrategies,
    });
    alternatives = enriched.alternatives;
    enrichmentMeta = {
      blocking: enriched.blocking,
      rerank: enriched.rerank || null,
    };
  }

  let best = pickBestInquiryAlternative(alternatives, searchText);
  // Только exact/analog дают цену и имя из каталога.
  // similar / size_mismatch / none → «под заказ», без чужой цены 18.50.
  let accepted =
    best && (best.matchType === "exact" || best.matchType === "analog");
  // Minimum-info: never auto-exact/price when critical size/length is missing.
  if (underspecifiedSize && accepted) {
    accepted = false;
  }
  // Lexical vs embedding top-1 disagree → block automatic exact.
  if (retrieverDisagreement && accepted && best.matchType === "exact") {
    accepted = false;
  }
  // Request silent about strength class / material while the catalog holds
  // variants priced severalfold apart → quoting any of them is a guess.
  // Same abstention on the DIN and the ГОСТ path.
  const variantAmbiguity = detectVariantAmbiguity({
    queryText: searchText,
    alternatives,
  });
  if (variantAmbiguity && accepted) {
    accepted = false;
  }

  let matchGates = null;
  if (matchEnrichmentEnabled() && alternatives.length) {
    matchGates = decideMatchGates({
      queryText: searchText,
      alternatives,
      products: candidates,
      best,
      retrieverDisagreement,
      underspecified: underspecifiedSize,
      lineTotal: (Number(best?.price) || 0) * (inquiryLine.quantity || 1),
    });
    if (enrichmentMeta) enrichmentMeta = { ...enrichmentMeta, ...matchGates };
    else enrichmentMeta = matchGates;

    // Golden override: operator-verified exact/analog must not be wiped by
    // selective / OOD gates (price still comes from live ShopDB SKU lookup).
    if (
      matchGates.gateRejected &&
      accepted &&
      best?.matchSource !== "golden_override"
    ) {
      accepted = false;
    }
  }
  const isAnalog = accepted && best.matchType === "analog";

  // Не найден точный товар и аналог — подсказать ближайший похожий,
  // но НЕ подставлять его цену в строку КП.
  let similarSuggestion = null;
  if (!accepted) {
    const similar = alternatives.find(
      (a) => a.matchType === "similar" && Number(a.price) > 0
    );
    if (similar) {
      similarSuggestion = {
        productId: similar.productId,
        name: similar.name,
        sku: similar.sku,
        price: Number(similar.price) || 0,
        productUrl: similar.productUrl,
      };
    } else if (
      best &&
      (underspecifiedSize || retrieverDisagreement || variantAmbiguity)
    ) {
      similarSuggestion = {
        productId: best.productId,
        name: best.name,
        sku: best.sku,
        price: Number(best.price) || 0,
        productUrl: best.productUrl,
      };
    }
  }

  const qty = inquiryLine.quantity || 1;
  const unitPrice = accepted ? Number(best.price) || 0 : 0;
  const hasPrice = unitPrice > 0;
  // Ед. изм. заявки ≠ шт → нельзя молча считать кг штуками: сумму не считаем.
  const unitNeedsRecalc = !!inquiryLine.needsReview;
  const priceWithVat = hasPrice
    ? Number((unitPrice * (1 + VAT_RATE)).toFixed(2))
    : 0;
  // Canonical quote contract: unitPriceNet/lineTotal/subtotal are net values;
  // priceWithVat is the gross value used by 1C/XLSX and editable UI fields.
  const lineTotal =
    hasPrice && !unitNeedsRecalc ? Number((unitPrice * qty).toFixed(2)) : 0;
  const weightKg = estimateWeightKg(inquiryLine, accepted ? best.name : null);
  const lineWeightKg =
    inquiryLine.unit === "кг" ? qty : Number((weightKg * qty).toFixed(4));

  let status = inquiryLine.needsReview
    ? STATUS.NEEDS_REVIEW
    : accepted
      ? best.status
      : STATUS.OUT_OF_STOCK;

  if (underspecifiedSize || retrieverDisagreement || variantAmbiguity) {
    status = STATUS.NEEDS_REVIEW;
  }
  if (matchGates?.gateRejected || matchGates?.anomaly?.outOfDistribution) {
    // Soft anomaly metadata stays on the line, but only hard gate rejection
    // forces NEEDS_REVIEW (missing embeddings must not wipe SQL prices).
    if (matchGates?.gateRejected) status = STATUS.NEEDS_REVIEW;
  }

  // Статус для таблицы КП (фиксированный словарь из регламента КП).
  let kpStatus;
  if (
    underspecifiedSize ||
    retrieverDisagreement ||
    variantAmbiguity ||
    matchGates?.gateRejected
  ) {
    kpStatus = "Требуется проверка";
  } else if (!accepted) {
    kpStatus = "Нет в базе";
  } else if (!hasPrice) {
    kpStatus = "Цена по запросу";
  } else if (unitNeedsRecalc) {
    kpStatus = "Требуется проверка";
  } else {
    kpStatus = isAnalog ? "Предложен аналог" : "Точное соответствие";
  }

  // Комментарий — единый явный текст для UI/КП, без домыслов.
  const commentParts = [];
  if (accepted && best?.matchSource === "golden_override") {
    commentParts.push(
      "Сопоставлено по эталону golden set (проверено оператором)"
    );
  }
  if (!accepted && override?.matchType === "none") {
    commentParts.push("Подтверждено golden set: соответствия в каталоге нет");
  }
  if (underspecifiedSize) {
    commentParts.push(
      `Недостаточно данных (${completeness.missing.join(", ")}) — цена не назначена`
    );
  }
  if (retrieverDisagreement) {
    commentParts.push(
      `Расхождение поиска: lexical=${retrieverDisagreement.lexicalProductId}, embedding=${retrieverDisagreement.embeddingProductId} — требуется подтверждение`
    );
  }
  if (variantAmbiguity) {
    const label =
      variantAmbiguity.field === "material"
        ? "материал (сталь / нержавейка)"
        : "класс прочности";
    commentParts.push(
      `В заявке не указан ${label}; в каталоге варианты ${variantAmbiguity.values.join(" / ")} — ` +
        `цена от ${variantAmbiguity.minPrice.toFixed(2)} до ${variantAmbiguity.maxPrice.toFixed(2)} RUB. ` +
        `Требуется уточнение, цена не назначена`
    );
  }
  if (matchGates?.anomaly?.outOfDistribution) {
    commentParts.push(
      `Аномалия ввода (${(matchGates.anomaly.reasons || []).join(", ")}) — автосопоставление отключено`
    );
  }
  if (matchGates?.gateRejected && matchGates.gateReason) {
    commentParts.push(
      `Селективный отказ (${matchGates.gateReason}) — требуется подтверждение оператора`
    );
  }
  if (isAnalog) {
    commentParts.push(
      `АНАЛОГ: вместо «${inquiryLine.name}» предложен «${best.name}»` +
        (best.analogOf ? ` (${best.analogOf})` : "")
    );
  } else if (!accepted && !underspecifiedSize && !variantAmbiguity) {
    commentParts.push("Точный товар отсутствует. Подходящий аналог не найден");
    if (best?.matchType === "spec_mismatch") {
      const labels = {
        product_type: "тип изделия",
        coating: "покрытие",
        material: "материал",
        strength_class: "класс прочности",
      };
      commentParts.push(
        `ближайший кандидат отличается: ${labels[best.mismatchReason] || "характеристики"}`
      );
    }
    if (best?.matchType === "size_unconfirmed") {
      commentParts.push(
        "в заявке не указан точный размер (M×L) — совпадение по стандарту найдено, но размер кандидата не подтверждён, требуется ручная проверка"
      );
    }
    if (similarSuggestion) {
      commentParts.push(
        `похожий вариант: «${similarSuggestion.name}» — ${similarSuggestion.price.toFixed(2)} RUB (требует подтверждения)`
      );
    }
  }
  if (accepted && !hasPrice) {
    commentParts.push("Цена в ShopDB отсутствует — цена по запросу");
  }
  if (accepted && hasPrice && unitNeedsRecalc) {
    commentParts.push(
      `Требуется уточнение пересчёта единиц измерения (заявка в «${inquiryLine.unit}»)`
    );
  }
  if (inquiryLine.specialRequirements) {
    commentParts.push(inquiryLine.specialRequirements);
  }

  const retrievedAt = new Date().toISOString();
  let displayMatchType = accepted
    ? best.matchType
    : underspecifiedSize
      ? "none"
      : variantAmbiguity
        ? // Must not stay "exact": every price-eligibility check downstream
          // (refreshDraftPrices, matchEvidence, prompts) keys off matchType.
          "spec_unconfirmed"
        : retrieverDisagreement
          ? "none"
          : best?.matchType || "none";

  let lineProductId = accepted ? best.productId || "" : "";
  let lineStatus = status;
  let lineAllowPrice = accepted && hasPrice;
  let lineKpStatus = kpStatus;

  const grounded = enforceExactGroundingContract({
    matchType: displayMatchType,
    productId: lineProductId,
    retrieverDisagreement,
    status: lineStatus,
    kpStatus: lineKpStatus,
    allowPrice: lineAllowPrice,
  });
  displayMatchType = grounded.matchType;
  lineProductId = grounded.productId;
  lineStatus = grounded.status;
  lineKpStatus = grounded.kpStatus;
  lineAllowPrice = grounded.allowPrice;

  const reviewReason = resolveReviewReason({
    accepted:
      !!lineProductId &&
      (displayMatchType === "exact" || displayMatchType === "analog"),
    matchType: displayMatchType,
    mismatchReason: best?.mismatchReason || null,
    unitNeedsRecalc,
    hasPrice: lineAllowPrice && hasPrice,
    retrieverDisagreement: !!retrieverDisagreement,
    underspecified: underspecifiedSize,
    goldenNone: !accepted && override?.matchType === "none",
    outOfDistribution: !!matchGates?.anomaly?.outOfDistribution,
    variantAmbiguous: !!variantAmbiguity,
    hardConstraint: (best?.constraintViolations || []).length > 0 && !accepted,
    selectiveReject: !!matchGates?.gateRejected && !accepted,
    gateReason: matchGates?.gateReason || null,
  });

  const matchedLine = {
    inquiryRaw: inquiryLine.raw,
    name: accepted && lineProductId ? best.name : inquiryLine.name,
    requestedName: inquiryLine.name,
    article: accepted && lineProductId ? sanitizeSku(best.sku) : "",
    productId: lineProductId,
    quantity: qty,
    unit: inquiryLine.unit || "шт",
    priceWithVat: lineAllowPrice ? priceWithVat : 0,
    unitPriceNet: lineAllowPrice ? unitPrice : 0,
    lineTotal: lineAllowPrice ? lineTotal : 0,
    weightKg,
    lineWeightKg,
    status: lineStatus,
    kpStatus: lineKpStatus,
    unitNeedsRecalc,
    matchType: displayMatchType,
    analogOf: accepted && lineProductId ? best.analogOf || null : null,
    similarSuggestion,
    comment: commentParts.join("; "),
    thread: inquiryLine.thread,
    alternatives,
    productUrl: accepted && lineProductId ? best.productUrl : undefined,
    // Provenance (persisted on the line, not only in metrics)
    matchSource:
      best?.matchSource ||
      matchStrategies[matchStrategies.length - 1] ||
      "none",
    matchStrategies,
    mismatchReason: best?.mismatchReason || reviewReason || null,
    reviewReason,
    missingAttributes: underspecifiedSize ? completeness.missing : [],
    retrieverDisagreement,
    retrievedAt,
    priceSnapshot: lineAllowPrice && hasPrice ? unitPrice : null,
    priceSource: lineAllowPrice ? best?.priceSource || null : null,
    allowPrice: lineAllowPrice,
    // Matching enrichment (constraints / LTR / selective / conformal / AL)
    anomaly: matchGates?.anomaly || null,
    conformalSet: matchGates?.conformal || null,
    activeLearning: matchGates?.activeLearning || null,
    matchExpert: matchGates?.expert?.id || null,
    selective: matchGates?.selective || null,
    blocking: enrichmentMeta?.blocking || null,
  };
  const evidenced = withLineEvidence(matchedLine, {
    requestId: options.requestId || null,
  });
  const candidateIds = candidates.map((candidate) => String(candidate.id));
  const denseHitCount = candidates.filter(
    (candidate) =>
      candidate._denseSimilarity != null ||
      candidateMatchSources(candidate).includes("catalog_dense")
  ).length;
  const sqlHitCount = candidates.filter((candidate) => {
    const sources = candidateMatchSources(candidate);
    return sources.some((source) =>
      [
        "structured",
        "product_fields",
        "sku",
        "category",
        "search_index",
        "name_cosine_pool",
        "name_cosine",
      ].includes(source)
    );
  }).length;
  const metric = {
    matchType: evidenced.matchType,
    source: evidenced.matchSource,
    strategies: matchStrategies,
    hasPrice: Number(evidenced.unitPriceNet) > 0,
    candidateCount: candidates.length,
    queryLen: searchText.length,
    threadId: options.threadId || null,
    requestId: options.requestId || null,
    productId: evidenced.productId || null,
    selectedProductId: accepted ? best?.productId || null : null,
    selectedSku: accepted ? best?.sku || null : null,
    priceSource: accepted ? best?.priceSource || null : null,
    candidateIds,
    sqlHitCount,
    denseHitCount,
    // Auto-accept = priced exact/analog that did not enter operator review.
    autoAccepted:
      accepted &&
      status !== STATUS.NEEDS_REVIEW &&
      kpStatus !== "Требуется проверка" &&
      !reviewReason,
    failureReason: !accepted
      ? best?.mismatchReason || reviewReason || best?.matchType || null
      : null,
    reviewReason,
    retrieverDisagreement,
    missingAttributes: evidenced.missingAttributes,
    algorithmProfile: DETERMINISTIC_MATCH_PROFILE.id,
    rulesVersion: MATCH_RULES_VERSION,
    evidence: evidenced.evidence,
    rerankMargin:
      matchGates?.rerank?.margin ?? enrichmentMeta?.rerank?.margin ?? null,
  };
  recordSearchMetric(metric);
  require("./shopDbLog").info("match decision", {
    requestId: options.requestId || null,
    sqlHits: sqlHitCount,
    denseHits: denseHitCount,
    candidateIds,
    selectedProductId: metric.selectedProductId,
    selectedSku: metric.selectedSku,
    priceSource: metric.priceSource,
    rejectReason: metric.failureReason,
    matchType: metric.matchType,
  });

  await setCachedLineMatch(options.threadId, cacheRaw, evidenced);
  return evidenced;
}

function estimateWeightKg(inquiryLine, productName) {
  // A quantity expressed in kg is the total requested line weight, not the
  // weight of one piece. Returning it as per-unit weight would square it later.
  if (inquiryLine.unit === "кг") return 0;
  const text = `${inquiryLine.raw} ${productName || ""}`;
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*кг/i);
  if (m) return Number(m[1].replace(",", "."));
  if (inquiryLine.thread) {
    const size = Number(inquiryLine.thread.size) || 8;
    const len = Number(inquiryLine.thread.length) || 40;
    return Number(((size * len * 0.002) / 1000).toFixed(4));
  }
  return 0;
}

function calculateTotalWeightKg(lines = []) {
  return lines.reduce((sum, line) => {
    if (Number.isFinite(Number(line.lineWeightKg))) {
      return sum + Number(line.lineWeightKg);
    }
    if (line.unit === "кг") return sum + (Number(line.quantity) || 0);
    return sum + (Number(line.weightKg) || 0) * (Number(line.quantity) || 1);
  }, 0);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await mapper(items[index], index);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

async function matchInquiryToDraft(inquiryText, options = {}) {
  const lines = parseInquiryText(inquiryText);
  if (!lines.length) {
    return {
      reference: generateQuoteReference({ prefix: "KP" }),
      lines: [],
      subtotal: 0,
      totalWeightKg: 0,
      total: 0,
    };
  }

  const concurrency = resolveMatchConcurrency(lines.length);
  const onProgress =
    typeof options.onProgress === "function" ? options.onProgress : null;
  const matchLine =
    typeof options.matchLine === "function"
      ? options.matchLine
      : matchInquiryLine;
  let completed = 0;
  let lastEmitAt = 0;
  // Full N stubs first — UI shows extracted RFQ rows; fill prices in place.
  const partialLines = lines.map((line) => buildPendingDraftLine(line));
  if (onProgress) {
    onProgress(
      draftProgressPayload(partialLines, {
        stage: "searching",
        completed: 0,
        total: lines.length,
      })
    );
  }

  const matched = await mapWithConcurrency(
    lines,
    concurrency,
    async (line, index) => {
      try {
        const result = await matchLine(line, {
          ...options,
          requestId: options.requestId || null,
          parsedFileTexts: options.parsedFileTexts || null,
        });
        partialLines[index] = result;
        completed += 1;
        const now = Date.now();
        // Per-line for small RFQs (visible progressive fill); throttle large ones.
        const emitEveryLine = lines.length <= 24;
        if (
          onProgress &&
          (emitEveryLine ||
            completed === 1 ||
            completed === lines.length ||
            now - lastEmitAt >= 200)
        ) {
          lastEmitAt = now;
          onProgress(
            draftProgressPayload(partialLines, {
              stage: "searching",
              completed,
              total: lines.length,
            })
          );
        }
        return result;
      } catch (e) {
        // Ошибка на одной позиции (например, обрыв MySQL) не должна отбрасывать
        // все уже успешно сопоставленные и оценённые строки заявки.
        const fallback = buildLineMatchErrorFallback(line, e);
        partialLines[index] = fallback;
        completed += 1;
        if (onProgress) {
          onProgress(
            draftProgressPayload(partialLines, {
              stage: "searching",
              completed,
              total: lines.length,
            })
          );
        }
        return fallback;
      }
    }
  );

  const draft = buildDraftFromMatchedLines(matched);
  if (onProgress) {
    const slimLines = draft.lines.map((line) =>
      slimLineForSse(line, { includeAlternatives: true })
    );
    onProgress({
      progressStage: "matched",
      lineCount: lines.length,
      matchedCount: lines.length,
      total: lines.length,
      quoteDraft: {
        step: 2,
        reference: draft.reference,
        hardwareLines: slimLines,
        preview: {
          lines: slimLines,
          subtotal: draft.subtotal,
          total: draft.total,
          totalWeightKg: draft.totalWeightKg,
        },
      },
    });
  }
  return draft;
}

function buildDraftFromMatchedLines(matched = []) {
  const subtotal = matched.reduce(
    (sum, line) => sum + (Number(line.lineTotal) || 0),
    0
  );
  const totalWeightKg = calculateTotalWeightKg(matched);
  return {
    reference: generateQuoteReference({ prefix: "KP" }),
    lines: matched,
    subtotal: Number(subtotal.toFixed(2)),
    totalWeightKg: Number(totalWeightKg.toFixed(3)),
    total: Number(subtotal.toFixed(2)),
    vatRate: VAT_RATE,
  };
}

module.exports = {
  matchInquiryToDraft,
  matchInquiryLine,
  buildLineMatchErrorFallback,
  buildPendingDraftLine,
  fetchProductStock,
  fetchProductStocks,
  pickBestInquiryAlternative,
  pickBestPricedSku,
  resolveMatchConcurrency,
  calculateTotalWeightKg,
  buildDraftFromMatchedLines,
  detectRetrieverDisagreement,
  enforceExactGroundingContract,
};
