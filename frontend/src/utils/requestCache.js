const cache = new Map();
const inflight = new Map();

function perfCacheLog(message, meta) {
  if (import.meta.env.DEV || import.meta.env.VITE_OFFER_KP_PERF_LOG === "true") {
    try {
      if (window.localStorage.getItem("offerKp_perf_log") === "0") return;
    } catch {
      /* ignore */
    }
    console.log(`[FRONTEND-PERF] cache:${message}`, meta ?? "");
  }
}

/**
 * Dedupes concurrent fetches and caches results for a short TTL.
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetcher
 * @param {number} [ttlMs=30000]
 * @returns {Promise<T>}
 */
export function cachedFetch(key, fetcher, ttlMs = 30_000) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < ttlMs) {
    perfCacheLog("hit", { key, ageMs: now - hit.at });
    return Promise.resolve(hit.value);
  }

  if (inflight.has(key)) {
    perfCacheLog("inflight", { key });
    return inflight.get(key);
  }

  const started = performance.now();
  perfCacheLog("miss", { key });

  const promise = Promise.resolve()
    .then(fetcher)
    .then((value) => {
      cache.set(key, { value, at: Date.now() });
      inflight.delete(key);
      perfCacheLog("stored", {
        key,
        ms: Math.round(performance.now() - started),
      });
      return value;
    })
    .catch((err) => {
      inflight.delete(key);
      perfCacheLog("error", {
        key,
        ms: Math.round(performance.now() - started),
        error: err?.message,
      });
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

export function invalidateCache(key) {
  cache.delete(key);
  inflight.delete(key);
}

export function invalidateCachePrefix(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}
