"use strict";

/**
 * Layered ShopDB caches — identity ≠ commercial ≠ raw SQL.
 *
 * Retrieval key shape:
 *   retrieval:v{N}:{indexVersion}:{pipelineVersion}:{limit}:{queryHash}
 *
 * Identity (match decision without price) lives longer.
 * Commercial (price/stock) is short-TTL — never stored inside identity entries.
 */

const crypto = require("crypto");
const {
  shopDbCacheEnabled,
  getCachedAgentResult,
  setCachedAgentResult,
} = require("./cache");
const { DETERMINISTIC_MATCH_PROFILE } = require("../matching/algorithmProfile");

/** Bump when retrieval fusion / candidate window semantics change. */
const RETRIEVAL_CACHE_VERSION = Math.max(
  1,
  parseInt(process.env.SHOP_DB_RETRIEVAL_CACHE_VERSION, 10) || 9
);

const MATCHING_CACHE_VERSION =
  process.env.OFFER_KP_MATCHING_CACHE_VERSION ||
  DETERMINISTIC_MATCH_PROFILE.id ||
  "deterministic-prod-v1";

const IDENTITY_TTL_MS = Math.max(
  60_000,
  parseInt(process.env.SHOP_DB_IDENTITY_CACHE_TTL_MS, 10) || 30 * 60 * 1000
);

const COMMERCIAL_TTL_MS = Math.max(
  5_000,
  parseInt(process.env.SHOP_DB_COMMERCIAL_CACHE_TTL_MS, 10) || 60_000
);

const IDENTITY_MAX = Math.max(
  100,
  parseInt(process.env.SHOP_DB_IDENTITY_CACHE_MAX, 10) || 2000
);

const COMMERCIAL_MAX = Math.max(
  50,
  parseInt(process.env.SHOP_DB_COMMERCIAL_CACHE_MAX, 10) || 1000
);

const COMMERCIAL_FIELDS = Object.freeze([
  "unitPriceNet",
  "priceWithVat",
  "lineTotal",
  "priceSnapshot",
  "priceSource",
  "priceRetrievedAt",
  "stockCount",
  // Weight is ShopDB feature data — never freeze a stale 0 / heuristic on identity.
  "weightKg",
  "lineWeightKg",
  // allowPrice is commercial eligibility, not identity. Freezing a stale
  // allowPrice=false on identity blocked hydrate from re-reading ShopDB.
  "allowPrice",
]);

class TtlLruCache {
  constructor({ ttlMs, maxEntries }) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    /** @type {Map<string, { value: unknown, expiresAt: number }>} */
    this.store = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    this.store.delete(key);
    this.store.set(key, entry);
    return cloneValue(entry.value);
  }

  set(key, value) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest != null) this.store.delete(oldest);
    }
    this.store.set(key, {
      value: cloneValue(value),
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear() {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats() {
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      ttlMs: this.ttlMs,
      maxEntries: this.maxEntries,
    };
  }
}

function cloneValue(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((row) =>
      row && typeof row === "object" ? { ...row } : row
    );
  }
  return { ...value };
}

function sha256(text) {
  return crypto
    .createHash("sha256")
    .update(String(text || ""), "utf8")
    .digest("hex");
}

function normalizeQueryText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function resolveIndexVersion(manifest = null) {
  if (manifest && typeof manifest === "object") {
    const parts = [
      manifest.version,
      manifest.productCount,
      manifest.embeddingModel,
      manifest.createdAt || manifest.updatedAt,
    ].filter((p) => p != null && String(p).trim() !== "");
    if (parts.length) return parts.map(String).join("|");
  }
  return process.env.SHOP_DB_INDEX_VERSION || "unknown";
}

function resolvePipelineVersion({
  retrievalWindow = null,
  bm25 = null,
  dense = null,
} = {}) {
  const window =
    retrievalWindow != null
      ? Number(retrievalWindow)
      : Math.max(
          50,
          Math.min(
            100,
            parseInt(process.env.SHOP_DB_RETRIEVAL_WINDOW, 10) || 100
          )
        );
  const bm25Flag =
    bm25 != null
      ? bm25
      : !["0", "false", "off", "no"].includes(
          String(process.env.SHOP_DB_BM25 ?? "1")
            .trim()
            .toLowerCase()
        );
  const denseFlag =
    dense != null
      ? dense
      : !["0", "false", "off", "no"].includes(
          String(process.env.SHOP_DB_CATALOG_DENSE ?? "1")
            .trim()
            .toLowerCase()
        );
  return [
    `win${window}`,
    bm25Flag ? "bm25" : "nobm25",
    denseFlag ? "dense" : "nodense",
  ].join("+");
}

/**
 * @param {{
 *   queryText: string,
 *   limit: number|string,
 *   indexVersion?: string,
 *   pipelineVersion?: string,
 *   extra?: string,
 * }} opts
 */
function buildRetrievalCacheKey(opts = {}) {
  const limit = Math.max(1, Math.min(200, parseInt(opts.limit, 10) || 10));
  const indexVersion = opts.indexVersion || resolveIndexVersion();
  const pipelineVersion = opts.pipelineVersion || resolvePipelineVersion();
  const queryHash = sha256(normalizeQueryText(opts.queryText));
  const extra = opts.extra ? `:${sha256(opts.extra).slice(0, 12)}` : "";
  return `retrieval:v${RETRIEVAL_CACHE_VERSION}:${indexVersion}:${pipelineVersion}:${limit}:${queryHash}${extra}`;
}

/**
 * @param {{
 *   inquiryText: string,
 *   indexVersion?: string,
 *   matchingVersion?: string,
 * }} opts
 */
function buildMatchIdentityCacheKey(opts = {}) {
  const matchingVersion = opts.matchingVersion || MATCHING_CACHE_VERSION;
  const indexVersion = opts.indexVersion || resolveIndexVersion();
  const inquiryHash = sha256(normalizeQueryText(opts.inquiryText));
  return `match:v1:${matchingVersion}:${indexVersion}:${inquiryHash}`;
}

function stripCommercialFields(line = {}) {
  if (!line || typeof line !== "object") return line;
  const next = { ...line };
  for (const key of COMMERCIAL_FIELDS) delete next[key];
  if (Array.isArray(next.alternatives)) {
    next.alternatives = next.alternatives.map((alt) => {
      if (!alt || typeof alt !== "object") return alt;
      const copy = { ...alt };
      delete copy.price;
      delete copy.unitPriceNet;
      delete copy.priceWithVat;
      return copy;
    });
  }
  if (next.evidence && typeof next.evidence === "object") {
    next.evidence = {
      ...next.evidence,
      shopdb_price: null,
      shopdb_retrieved_at: null,
    };
  }
  next._cacheLayer = "identity";
  return next;
}

function applyCommercialFields(line = {}, commercial = {}) {
  if (!line || typeof line !== "object") return line;
  const qty = Number(line.quantity) || 0;
  const unitNeedsRecalc = !!line.unitNeedsRecalc;
  // Commercial snapshot owns allowPrice after hydrate. Do not AND with a
  // stale line.allowPrice=false left over from a prior demotion.
  const allowPrice = commercial.allowPrice !== false;
  const unitPriceNet = allowPrice ? Number(commercial.unitPriceNet) || 0 : 0;
  const priceWithVat = allowPrice ? Number(commercial.priceWithVat) || 0 : 0;
  const lineTotal =
    allowPrice && unitPriceNet > 0 && !unitNeedsRecalc
      ? Number((unitPriceNet * qty).toFixed(2))
      : 0;
  // Weight only when commercial explicitly carried a ShopDB value (incl. 0 = missing).
  const hasWeight = Object.prototype.hasOwnProperty.call(
    commercial,
    "weightKg"
  );
  const weightKg = hasWeight ? Number(commercial.weightKg) || 0 : 0;
  const lineWeightKg = hasWeight
    ? line.unit === "кг"
      ? qty
      : Number((weightKg * qty).toFixed(6))
    : line.unit === "кг"
      ? qty
      : 0;
  const next = {
    ...line,
    // Never replace a pinned line article with a sibling bestSku from commercial.
    article: line.article || commercial.sku || "",
    unitPriceNet,
    priceWithVat,
    lineTotal,
    allowPrice,
    priceSnapshot: unitPriceNet > 0 ? unitPriceNet : null,
    priceSource: commercial.priceSource || null,
    priceRetrievedAt: commercial.retrievedAt || new Date().toISOString(),
    stockCount:
      commercial.stockCount != null ? commercial.stockCount : line.stockCount,
    ...(hasWeight ? { weightKg, lineWeightKg } : {}),
  };
  if (Array.isArray(commercial.alternatives)) {
    next.alternatives = commercial.alternatives;
  }
  if (next.evidence && typeof next.evidence === "object") {
    next.evidence = {
      ...next.evidence,
      shopdb_price: unitPriceNet > 0 ? unitPriceNet : null,
      shopdb_retrieved_at: next.priceRetrievedAt,
      selected_sku: next.article || next.evidence.selected_sku || null,
    };
  }
  delete next._cacheLayer;
  return next;
}

function buildCommercialCacheKey(productId) {
  return `commercial:v1:${String(productId || "").trim()}`;
}

const identityCache = new TtlLruCache({
  ttlMs: IDENTITY_TTL_MS,
  maxEntries: IDENTITY_MAX,
});
const commercialCache = new TtlLruCache({
  ttlMs: COMMERCIAL_TTL_MS,
  maxEntries: COMMERCIAL_MAX,
});

function getCachedRetrieval(key) {
  if (!shopDbCacheEnabled() || !key) return undefined;
  return getCachedAgentResult(key);
}

function setCachedRetrieval(key, result) {
  if (!shopDbCacheEnabled() || !key) return;
  setCachedAgentResult(key, result);
}

function getCachedMatchIdentity(key) {
  if (!shopDbCacheEnabled() || !key) return undefined;
  return identityCache.get(key);
}

function setCachedMatchIdentity(key, line) {
  if (!shopDbCacheEnabled() || !key || !line) return;
  identityCache.set(key, stripCommercialFields(line));
}

function getCachedCommercial(productId) {
  if (!shopDbCacheEnabled() || !productId) return undefined;
  return commercialCache.get(buildCommercialCacheKey(productId));
}

function setCachedCommercial(productId, commercial) {
  if (!shopDbCacheEnabled() || !productId || !commercial) return;
  commercialCache.set(buildCommercialCacheKey(productId), commercial);
}

function clearLayeredCaches() {
  identityCache.clear();
  commercialCache.clear();
}

function getLayeredCacheStats() {
  return {
    retrievalVersion: RETRIEVAL_CACHE_VERSION,
    matchingVersion: MATCHING_CACHE_VERSION,
    identity: identityCache.stats(),
    commercial: commercialCache.stats(),
  };
}

module.exports = {
  TtlLruCache,
  sha256,
  RETRIEVAL_CACHE_VERSION,
  MATCHING_CACHE_VERSION,
  IDENTITY_TTL_MS,
  COMMERCIAL_TTL_MS,
  COMMERCIAL_FIELDS,
  normalizeQueryText,
  resolveIndexVersion,
  resolvePipelineVersion,
  buildRetrievalCacheKey,
  buildMatchIdentityCacheKey,
  buildCommercialCacheKey,
  stripCommercialFields,
  applyCommercialFields,
  getCachedRetrieval,
  setCachedRetrieval,
  getCachedMatchIdentity,
  setCachedMatchIdentity,
  getCachedCommercial,
  setCachedCommercial,
  clearLayeredCaches,
  getLayeredCacheStats,
};
