"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");
const { pingShopDb, isShopDbConfigured } = require("./db/client");
const {
  INDEX_DIR,
  embeddingModel,
  denseEnabled,
  indexIsFresh,
  getCanonicalCatalogManifest,
  getCanonicalCatalogRecords,
} = require("./canonicalCatalogIndex");
const { getShopDbVectorStore } = require("./shopDbVectorStore");
const { checkpointPaths } = require("./canonicalVectorCheckpoint");
const {
  enabled: bm25Enabled,
  getShopDbBm25Index,
} = require("./shopDbBm25Index");

const READINESS_CACHE_MS = Math.max(
  250,
  Math.min(
    30_000,
    parseInt(process.env.SHOP_DB_READINESS_CACHE_MS, 10) || 5_000
  )
);

let readinessCache = null;
let readinessCacheUntil = 0;
let readinessPromise = null;

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function processState(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return "idle";
  try {
    process.kill(numericPid, 0);
  } catch (error) {
    return error?.code === "EPERM" ? "running" : "stale";
  }
  try {
    const status = fs.readFileSync(`/proc/${numericPid}/stat`, "utf8");
    const state = status.match(/^\d+\s+\(.+\)\s+([A-Z])/i)?.[1];
    if (state === "T" || state === "t") return "stopped";
  } catch {
    try {
      const state = execFileSync(
        "ps",
        ["-o", "state=", "-p", String(numericPid)],
        {
          encoding: "utf8",
          timeout: 1_000,
        }
      )
        .trim()
        .charAt(0);
      if (state === "T") return "stopped";
    } catch {
      // A live PID with unavailable process metadata is still running.
    }
  }
  return "running";
}

function syncSnapshot() {
  const files = checkpointPaths(INDEX_DIR);
  const checkpoint = readJson(files.meta, null);
  const lock = readJson(files.lock, null);
  return {
    state: lock ? processState(lock.pid) : "idle",
    pid: Number(lock?.pid) || null,
    startedAt: lock?.startedAt || null,
    checkpointCount: Number(checkpoint?.count) || 0,
    checkpointUpdatedAt: checkpoint?.updatedAt || null,
  };
}

function readinessCode(status) {
  if (!status.mysqlOk) return "DB_UNAVAILABLE";
  if (!status.indexReady) return "INDEX_NOT_READY";
  return null;
}

async function computeShopDbReadiness() {
  const configured = isShopDbConfigured();
  const ping = configured
    ? await pingShopDb()
    : { ok: false, activeProducts: 0, error: "SHOP_DB_NOT_CONFIGURED" };
  const manifest = getCanonicalCatalogManifest();
  const catalogRecords = getCanonicalCatalogRecords();
  const indexProductCount = catalogRecords.length;
  const bm25Count = bm25Enabled()
    ? getShopDbBm25Index(catalogRecords)?.count || 0
    : 0;
  let vectorCount = 0;
  let vectorError = null;

  if (denseEnabled()) {
    try {
      vectorCount = await getShopDbVectorStore(embeddingModel()).count();
    } catch (error) {
      vectorError = error?.message || String(error);
    }
  }

  const activeProducts = Number(ping.activeProducts) || 0;
  const mysqlOk = ping.ok === true;
  const productCountsMatch =
    mysqlOk &&
    activeProducts > 0 &&
    indexProductCount === activeProducts &&
    Number(manifest?.productCount) === activeProducts;
  const vectorsReady =
    !denseEnabled() ||
    (manifest?.hasVectors === true &&
      vectorCount === activeProducts &&
      Number(manifest?.vectorCount) === activeProducts);
  const bm25Ready = !bm25Enabled() || bm25Count === activeProducts;
  const fresh = indexIsFresh();
  const indexReady = productCountsMatch && vectorsReady && bm25Ready && fresh;

  const status = {
    mysqlOk,
    configured,
    activeProducts,
    indexProductCount,
    vectorCount,
    bm25Count,
    indexFresh: fresh,
    indexReady,
    productCountsMatch,
    vectorsReady,
    bm25Ready,
    retrievers: {
      bm25: bm25Enabled(),
      dense: denseEnabled(),
      fusion: "rrf",
      compatibleLimit: Math.max(
        1,
        parseInt(process.env.SHOP_DB_RRF_COMPATIBLE_LIMIT, 10) || 45
      ),
      analogLimit: Math.max(
        0,
        parseInt(process.env.SHOP_DB_RRF_ANALOG_LIMIT, 10) || 5
      ),
    },
    lastSync: manifest?.createdAt || null,
    embeddingModel: embeddingModel(),
    vectorDims: Number(manifest?.vectorDims) || 0,
    manifestVersion: Number(manifest?.version) || null,
    vectorStore: manifest?.vectorStore || null,
    sync: syncSnapshot(),
    mysqlError: ping.error || null,
    vectorError,
  };
  return { ...status, code: readinessCode(status), ready: indexReady };
}

async function getShopDbReadiness({ force = false } = {}) {
  const now = Date.now();
  if (!force && readinessCache && now < readinessCacheUntil) {
    return readinessCache;
  }
  if (readinessPromise) return readinessPromise;
  readinessPromise = computeShopDbReadiness()
    .then((status) => {
      readinessCache = status;
      readinessCacheUntil = Date.now() + READINESS_CACHE_MS;
      return status;
    })
    .finally(() => {
      readinessPromise = null;
    });
  return readinessPromise;
}

function clearShopDbReadinessCache() {
  readinessCache = null;
  readinessCacheUntil = 0;
  readinessPromise = null;
}

module.exports = {
  READINESS_CACHE_MS,
  getShopDbReadiness,
  clearShopDbReadinessCache,
  readinessCode,
  syncSnapshot,
};
