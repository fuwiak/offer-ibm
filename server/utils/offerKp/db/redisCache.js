"use strict";

/**
 * Opcjonalny L2 Redis nad lokalnymi cache'ami L1 (LRU in-process).
 *
 *   request → L1 local LRU → miss → L2 Redis → miss → SQL/ES/embedding
 *
 * Wyłączony domyślnie: OFFER_KP_REDIS_CACHE=1 włącza (Redis już stoi pod
 * BullMQ — REDIS_URL / OFFER_KP_REDIS_URL). Zasada fail-open: każdy błąd
 * Redis (down, timeout, parse) = miss, nigdy wyjątek do pipeline'u.
 * Operacje mają twardy timeout, żeby wolny Redis nie był wolniejszy niż
 * praca, którą miał oszczędzić.
 *
 * Klucze bez threadId/userId — wynik retrieval/matching jest współdzielony
 * między użytkownikami. Ceny/stany magazynu NIE przechodzą przez ten cache.
 */

const KEY_PREFIX = "offerkp:";

function redisCacheEnabled() {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.OFFER_KP_REDIS_CACHE || "")
      .trim()
      .toLowerCase()
  );
}

function redisOpTimeoutMs() {
  const n = parseInt(process.env.OFFER_KP_REDIS_CACHE_TIMEOUT_MS, 10);
  if (Number.isFinite(n) && n >= 20) return Math.min(n, 5_000);
  return 250;
}

function defaultTtlSeconds() {
  const n = parseInt(process.env.OFFER_KP_REDIS_CACHE_TTL_S, 10);
  if (Number.isFinite(n) && n >= 5) return Math.min(n, 7 * 24 * 3600);
  return 600;
}

let clientPromise = null;
let disabledUntil = 0;

function markUnavailable() {
  // Back off for 30s after a failure — no per-request reconnect storms.
  disabledUntil = Date.now() + 30_000;
  clientPromise = null;
}

async function getClient() {
  if (!redisCacheEnabled()) return null;
  if (Date.now() < disabledUntil) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const { getSharedRedis } = require("../queue/redisClient");
      return getSharedRedis();
    })().catch((error) => {
      markUnavailable();
      throw error;
    });
  }
  try {
    return await clientPromise;
  } catch {
    return null;
  }
}

function withOpTimeout(promise) {
  const ms = redisOpTimeoutMs();
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`redis op timeout ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * @param {string} key logical key (prefixed automatically)
 * @returns {Promise<unknown|undefined>} parsed JSON or undefined on miss/error
 */
async function getRedisCachedJson(key) {
  try {
    const client = await getClient();
    if (!client || !key) return undefined;
    const raw = await withOpTimeout(client.get(`${KEY_PREFIX}${key}`));
    if (raw == null) return undefined;
    return JSON.parse(raw);
  } catch {
    markUnavailable();
    return undefined;
  }
}

/**
 * Fire-and-forget friendly: caller may `void setRedisCachedJson(...)`.
 * @param {string} key
 * @param {unknown} value JSON-serializable
 * @param {number} [ttlSeconds]
 */
async function setRedisCachedJson(key, value, ttlSeconds = null) {
  try {
    const client = await getClient();
    if (!client || !key || value === undefined) return false;
    const ttl = Math.max(5, Number(ttlSeconds) || defaultTtlSeconds());
    await withOpTimeout(
      client.set(`${KEY_PREFIX}${key}`, JSON.stringify(value), "EX", ttl)
    );
    return true;
  } catch {
    markUnavailable();
    return false;
  }
}

/** Test helper. */
function resetRedisCacheForTests() {
  clientPromise = null;
  disabledUntil = 0;
}

module.exports = {
  KEY_PREFIX,
  redisCacheEnabled,
  getRedisCachedJson,
  setRedisCachedJson,
  resetRedisCacheForTests,
};
