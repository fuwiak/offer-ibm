"use strict";

/**
 * Durable match-identity store — survives process restart.
 *
 * Key: threadId + lineHash + indexVersion + matchingVersion
 *   (same string as buildMatchIdentityCacheKey)
 *
 * Value: identity-only line (no prices). Commercial always rehydrated
 * from ShopDB on read.
 *
 * Backend preference:
 *   1) Redis (long TTL) when reachable
 *   2) JSON files under STORAGE_DIR/offer-kp-match-cache/ (always mirrored)
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  stripCommercialFields,
  MATCHING_CACHE_VERSION,
} = require("./layeredCache");

const REDIS_PREFIX = "offerkp:match:durable:";
const DEFAULT_TTL_SEC = 14 * 24 * 3600; // 14 days
const REDIS_CONNECT_MS = Math.max(
  100,
  parseInt(process.env.OFFER_KP_DURABLE_REDIS_CONNECT_MS, 10) || 400
);

/** @type {boolean|null} */
let redisAvailable = null;
/** @type {number} */
let redisCheckedAt = 0;
const REDIS_RECHECK_MS = 30_000;

function durableMatchCacheEnabled() {
  const raw = String(process.env.OFFER_KP_DURABLE_MATCH_CACHE ?? "1")
    .trim()
    .toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function durableTtlSec() {
  const n = parseInt(process.env.OFFER_KP_DURABLE_MATCH_TTL_SEC, 10);
  return Number.isFinite(n) && n > 60 ? n : DEFAULT_TTL_SEC;
}

function cacheRootDir() {
  const base = process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : path.resolve(__dirname, "../../../storage");
  return path.join(base, "offer-kp-match-cache");
}

function filePathForKey(cacheKey) {
  const hash = crypto
    .createHash("sha256")
    .update(String(cacheKey || ""))
    .digest("hex");
  return path.join(cacheRootDir(), hash.slice(0, 2), `${hash}.json`);
}

function redisKey(cacheKey) {
  const hash = crypto
    .createHash("sha256")
    .update(String(cacheKey || ""))
    .digest("hex");
  return `${REDIS_PREFIX}${hash}`;
}

function withTimeout(promise, ms, label = "timeout") {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms);
    }),
  ]);
}

function redisBackendEnabled() {
  const raw = String(process.env.OFFER_KP_DURABLE_MATCH_REDIS ?? "1")
    .trim()
    .toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

async function redisUsable() {
  if (!redisBackendEnabled()) {
    redisAvailable = false;
    return false;
  }
  if (
    redisAvailable != null &&
    Date.now() - redisCheckedAt < REDIS_RECHECK_MS
  ) {
    return redisAvailable;
  }
  redisCheckedAt = Date.now();
  try {
    const { pingRedis } = require("../queue/redisClient");
    const ping = await withTimeout(
      pingRedis(REDIS_CONNECT_MS),
      REDIS_CONNECT_MS + 100,
      "redis ping timeout"
    );
    redisAvailable = !!ping?.ok;
  } catch (_) {
    redisAvailable = false;
  }
  return redisAvailable;
}

async function tryRedisGet(cacheKey) {
  if (!(await redisUsable())) return null;
  try {
    const { getSharedRedis } = require("../queue/redisClient");
    const redis = await withTimeout(
      getSharedRedis(),
      REDIS_CONNECT_MS + 200,
      "redis get connect timeout"
    );
    const raw = await withTimeout(
      redis.get(redisKey(cacheKey)),
      REDIS_CONNECT_MS,
      "redis get timeout"
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.identity) return null;
    if (parsed.expiresAt && Date.now() > Number(parsed.expiresAt)) {
      await redis.del(redisKey(cacheKey)).catch(() => {});
      return null;
    }
    return parsed.identity;
  } catch (_) {
    redisAvailable = false;
    return null;
  }
}

async function tryRedisSet(cacheKey, identity, ttlSec) {
  if (!(await redisUsable())) return false;
  try {
    const { getSharedRedis } = require("../queue/redisClient");
    const redis = await withTimeout(
      getSharedRedis(),
      REDIS_CONNECT_MS + 200,
      "redis set connect timeout"
    );
    const payload = JSON.stringify({
      identity,
      matchingVersion: MATCHING_CACHE_VERSION,
      expiresAt: Date.now() + ttlSec * 1000,
      storedAt: new Date().toISOString(),
    });
    await withTimeout(
      redis.set(redisKey(cacheKey), payload, "EX", ttlSec),
      REDIS_CONNECT_MS,
      "redis set timeout"
    );
    return true;
  } catch (_) {
    redisAvailable = false;
    return false;
  }
}

function readFileIdentity(cacheKey) {
  try {
    const fp = filePathForKey(cacheKey);
    if (!fs.existsSync(fp)) return null;
    const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (!parsed?.identity) return null;
    if (parsed.expiresAt && Date.now() > Number(parsed.expiresAt)) {
      fs.rmSync(fp, { force: true });
      return null;
    }
    return parsed.identity;
  } catch (_) {
    return null;
  }
}

function writeFileIdentity(cacheKey, identity, ttlSec) {
  try {
    const fp = filePathForKey(cacheKey);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const tmp = `${fp}.${process.pid}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        identity,
        matchingVersion: MATCHING_CACHE_VERSION,
        expiresAt: Date.now() + ttlSec * 1000,
        storedAt: new Date().toISOString(),
        cacheKey,
      }),
      "utf8"
    );
    fs.renameSync(tmp, fp);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * @param {string} cacheKey - from buildMatchIdentityCacheKey / lineMatchIdentityKey
 * @returns {Promise<object|null>}
 */
async function getDurableMatchIdentity(cacheKey) {
  if (!durableMatchCacheEnabled() || !cacheKey) return null;

  const fromRedis = await tryRedisGet(cacheKey);
  if (fromRedis) return fromRedis;

  return readFileIdentity(cacheKey);
}

/**
 * Persist identity-only match line (prices stripped).
 * @param {string} cacheKey
 * @param {object} line
 */
async function setDurableMatchIdentity(cacheKey, line) {
  if (!durableMatchCacheEnabled() || !cacheKey || !line) return false;
  const identity = stripCommercialFields(line);
  const ttl = durableTtlSec();

  const redisOk = await tryRedisSet(cacheKey, identity, ttl);
  const fileOk = writeFileIdentity(cacheKey, identity, ttl);
  return redisOk || fileOk;
}

async function deleteDurableMatchIdentity(cacheKey) {
  if (!cacheKey) return;
  if (await redisUsable()) {
    try {
      const { getSharedRedis } = require("../queue/redisClient");
      const redis = await getSharedRedis();
      await redis.del(redisKey(cacheKey));
    } catch (_) {
      /* ignore */
    }
  }
  try {
    fs.rmSync(filePathForKey(cacheKey), { force: true });
  } catch (_) {
    /* ignore */
  }
}

/** Test helper — reset Redis availability probe. */
function _resetRedisProbe() {
  redisAvailable = null;
  redisCheckedAt = 0;
}

module.exports = {
  durableMatchCacheEnabled,
  durableTtlSec,
  cacheRootDir,
  getDurableMatchIdentity,
  setDurableMatchIdentity,
  deleteDurableMatchIdentity,
  DEFAULT_TTL_SEC,
  _resetRedisProbe,
};
