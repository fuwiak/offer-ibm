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
let tail = Promise.resolve();

/**
 * Run `fn` exclusively wrt other withOnnxLock callers in this process.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withOnnxLock(fn) {
  const run = tail.then(() => fn());
  // Keep the chain alive even if this call rejects.
  tail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

module.exports = { withOnnxLock };
