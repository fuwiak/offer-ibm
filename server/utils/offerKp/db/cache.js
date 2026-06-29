/**
 * In-memory cache для read-only запросов к ShopDB.
 */

const crypto = require("crypto");

const DEFAULT_TTL_MS = Math.max(
  1000,
  parseInt(process.env.SHOP_DB_CACHE_TTL_MS, 10) || 5 * 60 * 1000
);
const MAX_ENTRIES = Math.max(
  50,
  parseInt(process.env.SHOP_DB_CACHE_MAX_ENTRIES, 10) || 500
);

function shopDbCacheEnabled() {
  const flag = (process.env.SHOP_DB_CACHE || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(flag)) return false;
  return true;
}

function normalizeSql(sql) {
  return String(sql || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isCacheableQuery(sql) {
  const normalized = normalizeSql(sql);
  if (!normalized.startsWith("select")) return false;
  if (/^select\s+1\b/.test(normalized)) return false;
  return true;
}

function makeCacheKey(sql, params = []) {
  const payload = JSON.stringify({
    sql: normalizeSql(sql),
    params: params.map((p) => (p == null ? null : p)),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function cloneRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => (row && typeof row === "object" ? { ...row } : row));
}

class ShopDbQueryCache {
  constructor({ ttlMs = DEFAULT_TTL_MS, maxEntries = MAX_ENTRIES } = {}) {
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
    return cloneRows(entry.value);
  }

  set(key, value) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest != null) this.store.delete(oldest);
    }
    this.store.set(key, {
      value: cloneRows(value),
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

const queryCache = new ShopDbQueryCache();
const agentResultCache = new ShopDbQueryCache({
  ttlMs: DEFAULT_TTL_MS,
  maxEntries: Math.min(200, MAX_ENTRIES),
});

function getCachedQuery(sql, params) {
  if (!shopDbCacheEnabled() || !isCacheableQuery(sql)) return undefined;
  return queryCache.get(makeCacheKey(sql, params));
}

function setCachedQuery(sql, params, rows) {
  if (!shopDbCacheEnabled() || !isCacheableQuery(sql)) return;
  queryCache.set(makeCacheKey(sql, params), rows);
}

function getCachedAgentResult(key) {
  if (!shopDbCacheEnabled() || !key) return undefined;
  return agentResultCache.get(key);
}

function setCachedAgentResult(key, result) {
  if (!shopDbCacheEnabled() || !key) return;
  agentResultCache.set(key, result);
}

function clearShopDbCache() {
  queryCache.clear();
  agentResultCache.clear();
}

module.exports = {
  shopDbCacheEnabled,
  isCacheableQuery,
  makeCacheKey,
  getCachedQuery,
  setCachedQuery,
  getCachedAgentResult,
  setCachedAgentResult,
  clearShopDbCache,
  getShopDbCacheStats: () => ({
    query: queryCache.stats(),
    agent: agentResultCache.stats(),
  }),
};
