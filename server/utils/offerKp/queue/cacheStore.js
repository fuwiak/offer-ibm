"use strict";

const { getSharedRedis } = require("./redisClient");

const OCR_PREFIX = "offerkp:ocr:";
const RETRIEVAL_PREFIX = "offerkp:retrieval:";
const PRICE_PREFIX = "offerkp:price:";
const INDEX_LOCK_KEY = "offerkp:lock:index-sync";

const OCR_TTL_SEC = Number(process.env.OFFER_KP_OCR_CACHE_TTL || 7 * 24 * 3600);
const RETRIEVAL_TTL_SEC = Number(
  process.env.OFFER_KP_RETRIEVAL_CACHE_TTL || 300
);
const PRICE_TTL_SEC = Number(process.env.OFFER_KP_PRICE_CACHE_TTL || 60);

async function getJson(key) {
  const redis = await getSharedRedis();
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function setJson(key, value, ttlSec) {
  const redis = await getSharedRedis();
  await redis.set(key, JSON.stringify(value), "EX", Math.max(1, ttlSec));
}

async function getOcrCache(jobId) {
  return getJson(`${OCR_PREFIX}${jobId}`);
}

async function setOcrCache(jobId, payload) {
  return setJson(`${OCR_PREFIX}${jobId}`, payload, OCR_TTL_SEC);
}

async function getRetrievalCache(cacheKey) {
  return getJson(`${RETRIEVAL_PREFIX}${cacheKey}`);
}

async function setRetrievalCache(cacheKey, payload) {
  return setJson(`${RETRIEVAL_PREFIX}${cacheKey}`, payload, RETRIEVAL_TTL_SEC);
}

async function getPriceCache(sku) {
  return getJson(`${PRICE_PREFIX}${String(sku || "").trim()}`);
}

async function setPriceCache(sku, payload) {
  return setJson(
    `${PRICE_PREFIX}${String(sku || "").trim()}`,
    payload,
    PRICE_TTL_SEC
  );
}

/**
 * Redis SET NX lock for catalog index sync (concurrency 1 across hosts).
 * @returns {Promise<string|null>} lock token or null if busy
 */
async function acquireIndexSyncLock(ttlSec = 30 * 60) {
  const redis = await getSharedRedis();
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ok = await redis.set(INDEX_LOCK_KEY, token, "EX", ttlSec, "NX");
  return ok === "OK" ? token : null;
}

async function releaseIndexSyncLock(token) {
  if (!token) return false;
  const redis = await getSharedRedis();
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const n = await redis.eval(script, 1, INDEX_LOCK_KEY, token);
  return Number(n) === 1;
}

module.exports = {
  getOcrCache,
  setOcrCache,
  getRetrievalCache,
  setRetrievalCache,
  getPriceCache,
  setPriceCache,
  acquireIndexSyncLock,
  releaseIndexSyncLock,
  INDEX_LOCK_KEY,
  OCR_TTL_SEC,
  RETRIEVAL_TTL_SEC,
  PRICE_TTL_SEC,
};
