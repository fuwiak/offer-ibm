const cache = new Map();
const inflight = new Map();

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
  if (hit && now - hit.at < ttlMs) return Promise.resolve(hit.value);

  if (inflight.has(key)) return inflight.get(key);

  const promise = Promise.resolve()
    .then(fetcher)
    .then((value) => {
      cache.set(key, { value, at: Date.now() });
      inflight.delete(key);
      return value;
    })
    .catch((err) => {
      inflight.delete(key);
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
