"use strict";

const fs = require("fs");
const path = require("path");

/** Minimum size (bytes) for a usable quantized ONNX embedding model. */
const MIN_ONNX_BYTES = 1_000_000;

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
  const { onnxQuantized, onnxPlain } = modelCachePaths(cacheDir, modelId);
  for (const onnxPath of [onnxQuantized, onnxPlain]) {
    try {
      const st = fs.statSync(onnxPath);
      if (st.isFile() && st.size >= MIN_ONNX_BYTES) {
        return { complete: true, onnxPath, size: st.size };
      }
    } catch {
      // missing
    }
  }
  return { complete: false, onnxPath: null, size: 0 };
}

/**
 * Ensure cache root exists (recursive).
 * @param {string} cacheDir
 */
function ensureCacheDir(cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

/**
 * Pin @xenova/transformers env so downloads always land in our cache dir
 * (not node_modules/@xenova/transformers/.cache, which yarn/npm wipe).
 * @param {object} env transformers env object
 * @param {string} cacheDir
 */
function pinTransformersCacheEnv(env, cacheDir) {
  if (!env || typeof env !== "object") return;
  ensureCacheDir(cacheDir);
  env.cacheDir = cacheDir;
  env.localModelPath = cacheDir;
  env.allowLocalModels = true;
  if (typeof env.useFSCache === "boolean") env.useFSCache = true;
}

module.exports = {
  MIN_ONNX_BYTES,
  resolveModelsCacheDir,
  forceModelRefresh,
  modelCachePaths,
  inspectCachedModel,
  ensureCacheDir,
  pinTransformersCacheEnv,
};
