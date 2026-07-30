"use strict";

/**
 * Durable Vision OCR store — GPU is last resort.
 *
 * Lookup order: Redis → disk JSON → (caller runs GPU)
 * On write: Redis + disk always (disk survives Redis TTL / restart).
 *
 * Key = jobId = sha256(fileHash|pipelineVersion|modelId|ocrPromptVersion)
 * Path: STORAGE_DIR/offer-kp-ocr-cache/{ab}/{jobId}.json
 */

const fs = require("fs");
const path = require("path");

const REDIS_PREFIX = "offerkp:ocr:";
const DEFAULT_REDIS_TTL_SEC = 7 * 24 * 3600;
const DEFAULT_DISK_TTL_SEC = 90 * 24 * 3600; // 90 days on disk
const REDIS_CONNECT_MS = Math.max(
  100,
  parseInt(process.env.OFFER_KP_DURABLE_REDIS_CONNECT_MS, 10) || 400
);

/** @type {boolean|null} */
let redisAvailable = null;
let redisCheckedAt = 0;
const REDIS_RECHECK_MS = 30_000;

function durableOcrEnabled() {
  const raw = String(process.env.OFFER_KP_DURABLE_OCR_CACHE ?? "1")
    .trim()
    .toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function redisBackendEnabled() {
  const raw = String(process.env.OFFER_KP_DURABLE_OCR_REDIS ?? "1")
    .trim()
    .toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function redisTtlSec() {
  const n = parseInt(process.env.OFFER_KP_OCR_CACHE_TTL, 10);
  return Number.isFinite(n) && n > 60 ? n : DEFAULT_REDIS_TTL_SEC;
}

function diskTtlSec() {
  const n = parseInt(process.env.OFFER_KP_OCR_DISK_TTL_SEC, 10);
  return Number.isFinite(n) && n > 60 ? n : DEFAULT_DISK_TTL_SEC;
}

function cacheRootDir() {
  const base = process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : path.resolve(__dirname, "../../../storage");
  return path.join(base, "offer-kp-ocr-cache");
}

function filePathForJobId(jobId) {
  const id = String(jobId || "").trim().toLowerCase();
  if (!/^[a-f0-9]{16,}$/.test(id)) {
    // still allow any non-empty id, shard by prefix
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128) || "unknown";
    return path.join(cacheRootDir(), safe.slice(0, 2), `${safe}.json`);
  }
  return path.join(cacheRootDir(), id.slice(0, 2), `${id}.json`);
}

function redisKey(jobId) {
  return `${REDIS_PREFIX}${jobId}`;
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
    const { pingRedis } = require("./redisClient");
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

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const text = String(payload.text || "");
  if (!text.trim()) return null;
  return {
    text,
    lines: payload.lines || null,
    engine: payload.engine || "qwen3-vl-cached",
    pdfPath: payload.pdfPath || null,
    fileHash: payload.fileHash || null,
    storedAt: payload.storedAt || new Date().toISOString(),
  };
}

function readDisk(jobId) {
  try {
    const fp = filePathForJobId(jobId);
    if (!fs.existsSync(fp)) return null;
    const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (parsed.expiresAt && Date.now() > Number(parsed.expiresAt)) {
      fs.rmSync(fp, { force: true });
      return null;
    }
    return normalizePayload(parsed.ocr || parsed);
  } catch (_) {
    return null;
  }
}

function writeDisk(jobId, payload) {
  try {
    const ocr = normalizePayload(payload);
    if (!ocr) return false;
    const fp = filePathForJobId(jobId);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const tmp = `${fp}.${process.pid}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        jobId,
        ocr,
        expiresAt: Date.now() + diskTtlSec() * 1000,
        storedAt: new Date().toISOString(),
      }),
      "utf8"
    );
    fs.renameSync(tmp, fp);
    return true;
  } catch (_) {
    return false;
  }
}

async function tryRedisGet(jobId) {
  if (!(await redisUsable())) return null;
  try {
    const { getSharedRedis } = require("./redisClient");
    const redis = await withTimeout(
      getSharedRedis(),
      REDIS_CONNECT_MS + 200,
      "redis get connect timeout"
    );
    const raw = await withTimeout(
      redis.get(redisKey(jobId)),
      REDIS_CONNECT_MS,
      "redis get timeout"
    );
    if (!raw) return null;
    return normalizePayload(JSON.parse(raw));
  } catch (_) {
    redisAvailable = false;
    return null;
  }
}

async function tryRedisSet(jobId, payload) {
  if (!(await redisUsable())) return false;
  try {
    const { getSharedRedis } = require("./redisClient");
    const redis = await withTimeout(
      getSharedRedis(),
      REDIS_CONNECT_MS + 200,
      "redis set connect timeout"
    );
    const ocr = normalizePayload(payload);
    if (!ocr) return false;
    await withTimeout(
      redis.set(redisKey(jobId), JSON.stringify(ocr), "EX", redisTtlSec()),
      REDIS_CONNECT_MS,
      "redis set timeout"
    );
    return true;
  } catch (_) {
    redisAvailable = false;
    return false;
  }
}

/**
 * Lookup: Redis → disk. Never runs GPU.
 * @returns {Promise<{text:string, lines?:*, engine?:string, source:'redis'|'disk'}|null>}
 */
async function getDurableOcr(jobId) {
  if (!durableOcrEnabled() || !jobId) return null;

  const fromRedis = await tryRedisGet(jobId);
  if (fromRedis) return { ...fromRedis, source: "redis" };

  const fromDisk = readDisk(jobId);
  if (fromDisk) {
    // Promote disk → Redis for faster next hit.
    await tryRedisSet(jobId, fromDisk);
    return { ...fromDisk, source: "disk" };
  }
  return null;
}

/**
 * Persist OCR result to Redis + disk. Call after every successful GPU OCR.
 */
async function setDurableOcr(jobId, payload) {
  if (!durableOcrEnabled() || !jobId) return false;
  const ocr = normalizePayload(payload);
  if (!ocr) return false;

  const redisOk = await tryRedisSet(jobId, ocr);
  const diskOk = writeDisk(jobId, ocr);
  return redisOk || diskOk;
}

function _resetRedisProbe() {
  redisAvailable = null;
  redisCheckedAt = 0;
}

module.exports = {
  durableOcrEnabled,
  cacheRootDir,
  getDurableOcr,
  setDurableOcr,
  filePathForJobId,
  DEFAULT_DISK_TTL_SEC,
  DEFAULT_REDIS_TTL_SEC,
  _resetRedisProbe,
};
