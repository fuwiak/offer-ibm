"use strict";

const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

/** Floor for unknown models — rejects empty/corrupt stubs. */
const MIN_ONNX_BYTES = 1_000_000;

/**
 * Per-model floors so a half-downloaded e5 (~470MB) is never "complete".
 * Real sizes (quantized): MiniLM ~23MB, e5-small ~449MB.
 */
const MODEL_MIN_ONNX_BYTES = {
  "Xenova/all-MiniLM-L6-v2": 10_000_000,
  "Xenova/nomic-embed-text-v1": 50_000_000,
  "MintplexLabs/multilingual-e5-small": 100_000_000,
  "Xenova/ms-marco-MiniLM-L-6-v2": 10_000_000,
};

const HF_HOST = "https://huggingface.co";
const DEFAULT_FALLBACK_HOST = "https://cdn.offerKp.com/support/models";

/** @type {Map<string, Promise<{ complete: boolean, onnxPath: string|null, size: number }>>} */
const ensureInflight = new Map();

/**
 * Stable on-disk cache root for @xenova/transformers models.
 * Prefer STORAGE_DIR/models; fall back to server/storage/models.
 * @returns {string}
 */
function resolveModelsCacheDir() {
  if (process.env.STORAGE_DIR) {
    return path.resolve(process.env.STORAGE_DIR, "models");
  }
  return path.resolve(__dirname, "../../../storage/models");
}

/**
 * @param {string} modelId
 * @returns {number}
 */
function minOnnxBytesFor(modelId) {
  return MODEL_MIN_ONNX_BYTES[String(modelId)] || MIN_ONNX_BYTES;
}

/**
 * @returns {boolean}
 */
function forceModelRefresh() {
  const raw = String(
    process.env.NATIVE_EMBEDDER_FORCE_REFRESH ||
      process.env.EMBEDDING_MODEL_FORCE_REFRESH ||
      ""
  )
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

/**
 * Paths xenova FileCache uses for a Hub model id.
 * @param {string} cacheDir
 * @param {string} modelId e.g. Xenova/all-MiniLM-L6-v2
 * @returns {{ modelDir: string, onnxQuantized: string, onnxPlain: string }}
 */
function modelCachePaths(cacheDir, modelId) {
  const modelDir = path.resolve(cacheDir, ...String(modelId).split("/"));
  return {
    modelDir,
    onnxQuantized: path.join(modelDir, "onnx", "model_quantized.onnx"),
    onnxPlain: path.join(modelDir, "onnx", "model.onnx"),
  };
}

/**
 * True when the primary ONNX weights exist and look complete (non-tiny).
 * Partial `.download-*` temps do not count.
 * @param {string} cacheDir
 * @param {string} modelId
 * @returns {{ complete: boolean, onnxPath: string|null, size: number }}
 */
function inspectCachedModel(cacheDir, modelId) {
  const minBytes = minOnnxBytesFor(modelId);
  const { onnxQuantized, onnxPlain } = modelCachePaths(cacheDir, modelId);
  for (const onnxPath of [onnxQuantized, onnxPlain]) {
    try {
      const st = fs.statSync(onnxPath);
      if (st.isFile() && st.size >= minBytes) {
        return { complete: true, onnxPath, size: st.size };
      }
    } catch {
      // missing
    }
  }
  return { complete: false, onnxPath: null, size: 0 };
}

/**
 * Tokenizer/config sidecars xenova needs besides ONNX.
 * @param {string} cacheDir
 * @param {string} modelId
 * @returns {boolean}
 */
function sidecarsPresent(cacheDir, modelId) {
  const { modelDir } = modelCachePaths(cacheDir, modelId);
  try {
    return (
      fs.statSync(path.join(modelDir, "config.json")).isFile() &&
      (fs.existsSync(path.join(modelDir, "tokenizer.json")) ||
        fs.existsSync(path.join(modelDir, "tokenizer_config.json")))
    );
  } catch {
    return false;
  }
}

/**
 * Ensure cache root exists (recursive).
 * @param {string} cacheDir
 */
function ensureCacheDir(cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

/**
 * Pin process env early (before @xenova/transformers import when possible).
 * xenova itself reads env.cacheDir, not TRANSFORMERS_CACHE — still set both.
 * @param {string} [cacheDir]
 */
function pinProcessCacheEnv(cacheDir = resolveModelsCacheDir()) {
  ensureCacheDir(cacheDir);
  process.env.TRANSFORMERS_CACHE = cacheDir;
  process.env.HF_HUB_CACHE = cacheDir;
  return cacheDir;
}

/**
 * Pin @xenova/transformers env so downloads always land in our cache dir
 * (not node_modules/@xenova/transformers/.cache, which yarn/npm wipe).
 * @param {object} env transformers env object
 * @param {string} cacheDir
 * @param {{ localOnly?: boolean }} [opts]
 */
function pinTransformersCacheEnv(env, cacheDir, opts = {}) {
  if (!env || typeof env !== "object") return;
  pinProcessCacheEnv(cacheDir);
  env.cacheDir = cacheDir;
  env.localModelPath = cacheDir;
  env.allowLocalModels = true;
  if (typeof env.useFSCache === "boolean") env.useFSCache = true;
  if (opts.localOnly) {
    env.allowRemoteModels = false;
  }
}

/**
 * Remove undersized / partial onnx artifacts so the next fetch is clean.
 * @param {string} cacheDir
 * @param {string} modelId
 * @returns {string[]} removed paths
 */
function purgeIncompleteOnnx(cacheDir, modelId) {
  const minBytes = minOnnxBytesFor(modelId);
  const { modelDir, onnxQuantized, onnxPlain } = modelCachePaths(
    cacheDir,
    modelId
  );
  const removed = [];
  for (const onnxPath of [onnxQuantized, onnxPlain]) {
    try {
      const st = fs.statSync(onnxPath);
      if (!st.isFile() || st.size >= minBytes) continue;
      fs.rmSync(onnxPath, { force: true });
      removed.push(onnxPath);
    } catch {
      // missing
    }
  }
  const onnxDir = path.join(modelDir, "onnx");
  try {
    for (const name of fs.readdirSync(onnxDir)) {
      if (!name.includes(".download-") && !name.endsWith(".partial")) continue;
      const p = path.join(onnxDir, name);
      fs.rmSync(p, { force: true });
      removed.push(p);
    }
  } catch {
    // no onnx dir yet
  }
  return removed;
}

/**
 * Stream a remote file to disk (atomic rename). Avoids xenova's
 * load-entire-470MB-into-RAM-then-write pattern that dies mid-download.
 * @param {string} url
 * @param {string} targetPath
 * @param {{ log?: function, minBytes?: number, label?: string }} [opts]
 * @returns {Promise<{ path: string, size: number }>}
 */
async function downloadFileToDisk(url, targetPath, opts = {}) {
  const log = typeof opts.log === "function" ? opts.log : () => {};
  const minBytes = opts.minBytes ?? MIN_ONNX_BYTES;
  const label = opts.label || path.basename(targetPath);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporary = `${targetPath}.download-${process.pid}-${Date.now()}`;

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const total = Number(response.headers.get("content-length") || 0);
  let loaded = 0;
  let lastPct = -1;

  const body = Readable.fromWeb(response.body);
  body.on("data", (chunk) => {
    loaded += chunk.length;
    if (!total) return;
    const pct = Math.floor((loaded / total) * 100);
    if (pct === lastPct || (pct !== 100 && pct - lastPct < 5 && pct !== 0)) {
      return;
    }
    lastPct = pct;
    log(`downloading ${label} ${pct}% (${loaded}/${total})`);
  });

  try {
    await pipeline(body, fs.createWriteStream(temporary, { flags: "w" }));
    const size = fs.statSync(temporary).size;
    if (size < minBytes) {
      fs.rmSync(temporary, { force: true });
      throw new Error(
        `Downloaded ${label} too small (${size} < ${minBytes} bytes)`
      );
    }
    if (total > 0 && size < total * 0.95) {
      fs.rmSync(temporary, { force: true });
      throw new Error(
        `Downloaded ${label} incomplete (${size} of ${total} bytes)`
      );
    }
    fs.renameSync(temporary, targetPath);
    return { path: targetPath, size };
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function buildOnnxUrls(modelId, filename, hosts) {
  const urls = [];
  for (const host of hosts) {
    const base = String(host || "").replace(/\/$/, "");
    if (!base) continue;
    if (base.includes("huggingface.co")) {
      urls.push(`${base}/${modelId}/resolve/main/${filename}`);
    } else {
      // Mintplex CDN layout: {host}/{model}/{file}
      urls.push(`${base}/${modelId}/${filename}`);
    }
  }
  return urls;
}

/**
 * Ensure quantized (or plain) ONNX exists on disk. Streams download itself —
 * never relies on xenova to persist the weights.
 * Concurrent callers share one in-flight promise per cacheDir+modelId.
 *
 * @param {string} cacheDir
 * @param {string} modelId
 * @param {{
 *   log?: function,
 *   force?: boolean,
 *   fallbackHost?: string,
 * }} [opts]
 * @returns {Promise<{ complete: boolean, onnxPath: string|null, size: number }>}
 */
async function ensureOnnxOnDisk(cacheDir, modelId, opts = {}) {
  pinProcessCacheEnv(cacheDir);
  const force = Boolean(opts.force) || forceModelRefresh();
  const log = typeof opts.log === "function" ? opts.log : () => {};
  const key = `${cacheDir}::${modelId}`;

  if (!force) {
    const hit = inspectCachedModel(cacheDir, modelId);
    if (hit.complete) {
      log(`using cached model at ${hit.onnxPath}`);
      return hit;
    }
  }

  let inflight = ensureInflight.get(key);
  if (inflight) return inflight;

  inflight = (async () => {
    const removed = purgeIncompleteOnnx(cacheDir, modelId);
    if (removed.length) {
      log(`purged incomplete onnx: ${removed.join(", ")}`);
    }

    if (!force) {
      const hit = inspectCachedModel(cacheDir, modelId);
      if (hit.complete) {
        log(`using cached model at ${hit.onnxPath}`);
        return hit;
      }
    }

    const { onnxQuantized, onnxPlain } = modelCachePaths(cacheDir, modelId);
    const hosts = [
      HF_HOST,
      opts.fallbackHost || DEFAULT_FALLBACK_HOST,
    ].filter(Boolean);
    const minBytes = minOnnxBytesFor(modelId);
    const attempts = [
      { file: "onnx/model_quantized.onnx", target: onnxQuantized },
      { file: "onnx/model.onnx", target: onnxPlain },
    ];

    let lastError = null;
    for (const attempt of attempts) {
      const urls = buildOnnxUrls(modelId, attempt.file, hosts);
      for (const url of urls) {
        try {
          log(`download: streaming ${attempt.file} ← ${url}`);
          const { size } = await downloadFileToDisk(url, attempt.target, {
            log,
            minBytes,
            label: attempt.file,
          });
          log(`download complete: ${attempt.target} (${size} bytes)`);
          return { complete: true, onnxPath: attempt.target, size };
        } catch (error) {
          lastError = error;
          log(
            `download failed for ${url}: ${error?.message || error}`
          );
        }
      }
    }

    throw lastError || new Error(`Failed to download ONNX for ${modelId}`);
  })().finally(() => {
    if (ensureInflight.get(key) === inflight) ensureInflight.delete(key);
  });

  ensureInflight.set(key, inflight);
  return inflight;
}

/** Test helper */
function resetEnsureOnnxInflightForTests() {
  ensureInflight.clear();
}

module.exports = {
  MIN_ONNX_BYTES,
  MODEL_MIN_ONNX_BYTES,
  resolveModelsCacheDir,
  minOnnxBytesFor,
  forceModelRefresh,
  modelCachePaths,
  inspectCachedModel,
  sidecarsPresent,
  ensureCacheDir,
  pinProcessCacheEnv,
  pinTransformersCacheEnv,
  purgeIncompleteOnnx,
  downloadFileToDisk,
  ensureOnnxOnDisk,
  resetEnsureOnnxInflightForTests,
};
