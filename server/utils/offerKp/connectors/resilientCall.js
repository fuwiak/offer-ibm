"use strict";

/**
 * Connector resilience: timeout + retry + circuit breaker.
 * Does not encode business rules — adapters return data; pricePolicy / guards decide.
 */

/**
 * @typedef {{
 *   name: string,
 *   failureThreshold?: number,
 *   cooldownMs?: number,
 *   halfOpenMax?: number,
 * }} CircuitOptions
 */

class CircuitBreaker {
  /**
   * @param {CircuitOptions} opts
   */
  constructor(opts = {}) {
    this.name = opts.name || "default";
    this.failureThreshold = Math.max(1, opts.failureThreshold ?? 5);
    this.cooldownMs = Math.max(1000, opts.cooldownMs ?? 30_000);
    this.halfOpenMax = Math.max(1, opts.halfOpenMax ?? 1);
    this.failures = 0;
    this.openedAt = 0;
    this.state = "closed"; // closed | open | half_open
    this.halfOpenInFlight = 0;
  }

  canPass() {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = "half_open";
        this.halfOpenInFlight = 0;
        return this.halfOpenInFlight < this.halfOpenMax;
      }
      return false;
    }
    // half_open
    return this.halfOpenInFlight < this.halfOpenMax;
  }

  onSuccess() {
    this.failures = 0;
    this.halfOpenInFlight = 0;
    this.state = "closed";
  }

  onFailure() {
    this.failures += 1;
    if (this.state === "half_open" || this.failures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
      this.halfOpenInFlight = 0;
    }
  }

  beginHalfOpenAttempt() {
    if (this.state === "half_open") this.halfOpenInFlight += 1;
  }

  snapshot() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      openedAt: this.openedAt || null,
    };
  }
}

const breakers = new Map();

/**
 * @param {string} name
 * @param {Omit<CircuitOptions, "name">} [opts]
 */
function getCircuitBreaker(name, opts = {}) {
  const key = String(name || "default");
  if (!breakers.has(key)) {
    breakers.set(key, new CircuitBreaker({ name: key, ...opts }));
  }
  return breakers.get(key);
}

/** Test helper — reset all breakers. */
function resetAllCircuitBreakers() {
  breakers.clear();
}

/**
 * @param {() => Promise<T>} fn
 * @param {number} ms
 * @returns {Promise<T>}
 * @template T
 */
function withTimeout(fn, ms) {
  const timeoutMs = Math.max(1, Number(ms) || 1);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const err = new Error(`TIMEOUT after ${timeoutMs}ms`);
      err.code = "ETIMEDOUT";
      reject(err);
    }, timeoutMs);
    Promise.resolve()
      .then(fn)
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      );
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableError(err) {
  if (!err) return false;
  const code = String(err.code || err.errno || "").toUpperCase();
  if (
    [
      "ETIMEDOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "EPIPE",
      "PROTOCOL_CONNECTION_LOST",
      "ER_LOCK_DEADLOCK",
      "ER_LOCK_WAIT_TIMEOUT",
    ].includes(code)
  ) {
    return true;
  }
  const msg = String(err.message || "").toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("503") ||
    msg.includes("429")
  );
}

/**
 * @param {() => Promise<T>} fn
 * @param {{
 *   name?: string,
 *   timeoutMs?: number,
 *   retries?: number,
 *   backoffMs?: number,
 *   retryOn?: (err: Error) => boolean,
 *   circuit?: CircuitBreaker|null,
 *   fallback?: () => Promise<T>|T,
 *   onLog?: (event: object) => void,
 * }} [opts]
 * @returns {Promise<T>}
 * @template T
 */
async function resilientCall(fn, opts = {}) {
  const name = opts.name || "call";
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retries = Math.max(0, opts.retries ?? 2);
  const backoffMs = Math.max(0, opts.backoffMs ?? 200);
  const retryOn = opts.retryOn || isRetryableError;
  const circuit = opts.circuit || null;
  const onLog = typeof opts.onLog === "function" ? opts.onLog : null;

  if (circuit && !circuit.canPass()) {
    onLog?.({ name, event: "circuit_open", circuit: circuit.snapshot() });
    if (opts.fallback) return await opts.fallback();
    const err = new Error(`CIRCUIT_OPEN:${name}`);
    err.code = "CIRCUIT_OPEN";
    throw err;
  }

  if (circuit?.state === "half_open") circuit.beginHalfOpenAttempt();

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now();
    try {
      const result = await withTimeout(fn, timeoutMs);
      circuit?.onSuccess();
      onLog?.({
        name,
        event: "ok",
        attempt,
        ms: Date.now() - t0,
        circuit: circuit?.snapshot(),
      });
      return result;
    } catch (err) {
      lastError = err;
      const retryable = attempt < retries && retryOn(err);
      onLog?.({
        name,
        event: retryable ? "retry" : "fail",
        attempt,
        ms: Date.now() - t0,
        error: err?.message || String(err),
        code: err?.code,
        circuit: circuit?.snapshot(),
      });
      if (!retryable) break;
      if (backoffMs) await sleep(backoffMs * (attempt + 1));
    }
  }

  circuit?.onFailure();
  if (opts.fallback) {
    onLog?.({ name, event: "fallback", error: lastError?.message });
    return await opts.fallback();
  }
  throw lastError;
}

module.exports = {
  CircuitBreaker,
  getCircuitBreaker,
  resetAllCircuitBreakers,
  withTimeout,
  isRetryableError,
  resilientCall,
};
