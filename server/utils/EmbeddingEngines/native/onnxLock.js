"use strict";

/**
 * Process-wide lock for onnxruntime / @xenova/transformers inference.
 *
 * Parallel pipeline() calls in the same Node process regularly SEGV
 * (signal 11) on resource-constrained hosts (Lainey T4: LM Studio ~9GB RSS,
 * no swap). Match concurrency >1 was hitting NativeEmbedder concurrently
 * and killing offer-kp mid-stream → client "network error".
 */

/** @type {Promise<void>} */
let inferenceTail = Promise.resolve();

/** @type {Promise<void>} */
let downloadTail = Promise.resolve();

/**
 * Run `fn` exclusively wrt other withOnnxLock callers in this process.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withOnnxLock(fn) {
  const run = inferenceTail.then(() => fn());
  // Keep the chain alive even if this call rejects.
  inferenceTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Serialize HF/CDN model downloads separately from inference.
 * Must NOT nest under withOnnxLock (embedChunks already holds that lock
 * when it first calls embedderClient — nesting would deadlock).
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withModelDownloadLock(fn) {
  const run = downloadTail.then(() => fn());
  downloadTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

module.exports = { withOnnxLock, withModelDownloadLock };
