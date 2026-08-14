"use strict";

/**
 * Lekki, opcjonalny embedding-boost dla dopasowania linii zapytania do nazw
 * produktów ShopDB. Dokłada dodatkowy sygnał semantyczny NAD istniejący
 * TF-IDF/Levenshtein/Jaro-Winkler z nameSimilarity.js — nie zastępuje go i
 * nie zmienia jego publicznego API ani synchronicznych funkcji używanych do
 * klastrowania (productsAreSimilar/pickCheaperAmongSimilar).
 *
 * Model: multilingual-e5-small przez @xenova/transformers — ta sama
 * biblioteka i ten sam mechanizm ładowania/fallbacku co NativeEmbedder
 * (server/utils/EmbeddingEngines/native), uruchamiany lokalnie na CPU (bez
 * GPU/LM Studio), więc nie konkuruje o VRAM na T4. Model jest osobny od
 * EMBEDDING_MODEL_PREF (który steruje głównym RAG) — nie chcemy przypadkowo
 * zmieniać zachowania czatu tym flagiem.
 *
 * Każdy błąd (brak sieci przy pierwszym pobraniu modelu, timeout, itp.)
 * wyłącza embedding-boost na resztę procesu i pipeline wraca do czystego
 * TF-IDF — zgodnie z filozofią projektu "graceful fallback, nie blokuj czatu".
 */

const crypto = require("crypto");
const { NativeEmbedder } = require("../EmbeddingEngines/native");

function envFlagEnabled(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return !["0", "false", "no", "off"].includes(
    String(raw).trim().toLowerCase()
  );
}

const EMBEDDING_ENABLED = envFlagEnabled("SHOP_DB_EMBEDDING_SIMILARITY", true);

const DEFAULT_MODEL = "MintplexLabs/multilingual-e5-small";
const EMBEDDING_MODEL = (() => {
  const envModel = process.env.SHOP_DB_EMBEDDING_MODEL;
  if (envModel && NativeEmbedder.supportedModels?.[envModel]) return envModel;
  return DEFAULT_MODEL;
})();

// Waga sygnału embeddingowego w blendzie z istniejącym TF-IDF score (0..1).
const EMBEDDING_WEIGHT = Math.min(
  1,
  Math.max(0, Number(process.env.SHOP_DB_EMBEDDING_WEIGHT || 0.3))
);

// Covers the default SQL-LIKE candidate pool size in full (nameSimilarity.js
// fetches up to max(limit*8, 80)) so a paraphrase ranked low by TF-IDF still
// gets a chance at an embedding-based rescue instead of being cut before
// reaching the embedder.
const MAX_CANDIDATES = Math.max(
  1,
  parseInt(process.env.SHOP_DB_EMBEDDING_MAX_CANDIDATES, 10) || 80
);

const CACHE_TTL_MS = Math.max(
  60_000,
  parseInt(process.env.SHOP_DB_EMBEDDING_CACHE_TTL_MS, 10) ||
    24 * 60 * 60 * 1000
);
const CACHE_MAX_ENTRIES = Math.max(
  200,
  parseInt(process.env.SHOP_DB_EMBEDDING_CACHE_MAX_ENTRIES, 10) || 4000
);

class ShopDbEmbedder extends NativeEmbedder {
  constructor() {
    super();
    const configured = parseInt(
      process.env.SHOP_DB_CATALOG_EMBED_CONCURRENCY,
      10
    );
    // Default 4 (was 25): large batches + parallel match lines SEGV onnx on
    // Lainey (15GB, LM Studio ~9GB, no swap). Override via env if needed.
    this.maxConcurrentChunks = Math.min(
      64,
      Math.max(1, Number.isFinite(configured) ? configured : 4)
    );
  }

  // Model dla dopasowania katalogu jest zawsze multilingual, niezależnie od
  // globalnego EMBEDDING_MODEL_PREF (który konfiguruje osobny RAG-embedder).
  getEmbeddingModel() {
    return EMBEDDING_MODEL;
  }
}

let embedder = null;
let embedderDisabled = !EMBEDDING_ENABLED;

function getEmbedder() {
  if (embedderDisabled) return null;
  if (!embedder) {
    try {
      embedder = new ShopDbEmbedder();
    } catch (error) {
      embedderDisabled = true;
      console.error(
        "[ShopDbEmbedding] Init failed, disabling embedding boost:",
        error?.message || error
      );
      return null;
    }
  }
  return embedder;
}

const QUERY_CACHE_TTL_MS = Math.max(
  60_000,
  parseInt(process.env.SHOP_DB_QUERY_EMBEDDING_CACHE_TTL_MS, 10) ||
    7 * 24 * 60 * 60 * 1000
);
const QUERY_CACHE_MAX_ENTRIES = Math.max(
  100,
  parseInt(process.env.SHOP_DB_QUERY_EMBEDDING_CACHE_MAX_ENTRIES, 10) || 2000
);

/** @type {Map<string, { vector: number[], expiresAt: number }>} */
const vectorCache = new Map();
/** @type {Map<string, { vector: number[], expiresAt: number }>} */
const queryVectorCache = new Map();

function textHash(text) {
  return crypto
    .createHash("sha256")
    .update(String(text || ""), "utf8")
    .digest("hex")
    .slice(0, 24);
}

// Key = model + productId + hash of the embedded text: a renamed product
// (same id) must never serve the stale vector of its previous name.
function productCacheKey(productId, name) {
  return `p:${EMBEDDING_MODEL}:${String(productId)}:${textHash(name)}`;
}

// Key = model + normalized query hash: identical queries across users and
// requests share one vector; model in the key survives model switches.
function queryCacheKey(text) {
  return `q:${EMBEDDING_MODEL}:${textHash(
    String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
  )}`;
}

function mapCacheGet(store, key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  store.delete(key);
  store.set(key, entry);
  return entry.vector;
}

function mapCacheSet(store, key, vector, ttlMs, maxEntries) {
  if (store.size >= maxEntries) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { vector, expiresAt: Date.now() + ttlMs });
}

function cacheGet(productId, name) {
  return mapCacheGet(vectorCache, productCacheKey(productId, name));
}

function cacheSet(productId, name, vector) {
  mapCacheSet(
    vectorCache,
    productCacheKey(productId, name),
    vector,
    CACHE_TTL_MS,
    CACHE_MAX_ENTRIES
  );
}

function queryCacheGet(text) {
  return mapCacheGet(queryVectorCache, queryCacheKey(text));
}

function queryCacheSet(text, vector) {
  mapCacheSet(
    queryVectorCache,
    queryCacheKey(text),
    vector,
    QUERY_CACHE_TTL_MS,
    QUERY_CACHE_MAX_ENTRIES
  );
}

// Proces-wide mutex na wywołania ONNX: równoległe linie zapytania nie mogą
// fan-outować wielu sesji embed naraz (SEGV signal 11 na Lainey bez swapu).
// Dzięki temu matchInquiryLines może bezpiecznie podnieść concurrency linii —
// SQL/ES idą równolegle, a embed zawsze pojedynczo.
let embedGate = Promise.resolve();
function withEmbedLock(task) {
  const run = embedGate.then(task, task);
  embedGate = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Embed query text with cache (model + normalized-query hash). */
async function embedQueryTextCached(active, text) {
  const cached = queryCacheGet(text);
  if (cached) return cached;
  const vector = await withEmbedLock(() => active.embedTextInput(text));
  if (vector?.length) queryCacheSet(text, vector);
  return vector;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Embeduje zapytanie i brakujące w cache nazwy kandydatów jednym batchem,
 * zwraca mapę productId -> cosine similarity z zapytaniem.
 * Pusta mapa = embedding niedostępny (wyłączony/błąd) — wołający ma wtedy
 * zachować się dokładnie tak, jakby tej funkcji nie było.
 * @param {string} queryText
 * @param {Array<{id: string|number, name: string}>} candidates
 * @returns {Promise<Map<string|number, number>>}
 */
async function computeEmbeddingSimilarities(queryText, candidates) {
  const active = getEmbedder();
  const text = String(queryText || "").trim();
  if (!active || !text || !candidates?.length) return new Map();

  const pool = candidates.slice(0, MAX_CANDIDATES);
  const passagePrefix = active.embeddingPrefix || "";
  const toEmbed = [];
  const toEmbedRows = [];
  for (const c of pool) {
    if (c?.id == null) continue;
    if (cacheGet(c.id, c.name) != null) continue;
    toEmbed.push(`${passagePrefix}${String(c.name || "").trim()}`);
    toEmbedRows.push(c);
  }

  try {
    if (toEmbed.length) {
      const vectors = await withEmbedLock(() => active.embedChunks(toEmbed));
      if (Array.isArray(vectors)) {
        toEmbedRows.forEach((c, idx) => {
          if (vectors[idx]) cacheSet(c.id, c.name, vectors[idx]);
        });
      }
    }

    const queryVector = await embedQueryTextCached(active, text);
    if (!queryVector?.length) return new Map();

    const result = new Map();
    for (const c of pool) {
      if (c?.id == null) continue;
      const vector = cacheGet(c.id, c.name);
      if (vector) result.set(c.id, cosineSimilarity(queryVector, vector));
    }
    return result;
  } catch (error) {
    // Sieć/model padł raz — nie próbuj dalej w tym procesie, wracamy do TF-IDF.
    embedderDisabled = true;
    console.error(
      "[ShopDbEmbedding] Embedding failed, disabling for this process:",
      error?.message || error
    );
    return new Map();
  }
}

/**
 * Embed arbitrary texts with the passage prefix (catalog documents).
 * @param {string[]} texts
 * @returns {Promise<number[][]|null>}
 */
async function embedPassageTexts(texts = []) {
  const active = getEmbedder();
  if (!active || !texts.length) return null;
  const prefix = active.embeddingPrefix || "";
  const payloads = texts.map((text) => `${prefix}${String(text || "").trim()}`);
  try {
    const vectors = await withEmbedLock(() => active.embedChunks(payloads));
    return Array.isArray(vectors) ? vectors : null;
  } catch (error) {
    embedderDisabled = true;
    console.error(
      "[ShopDbEmbedding] Passage embed failed, disabling for this process:",
      error?.message || error
    );
    return null;
  }
}

/**
 * Embed a search query with the model query prefix.
 * @param {string} queryText
 * @returns {Promise<number[]|null>}
 */
async function embedQueryText(queryText) {
  const active = getEmbedder();
  const text = String(queryText || "").trim();
  if (!active || !text) return null;
  try {
    const vector = await embedQueryTextCached(active, text);
    return vector?.length ? vector : null;
  } catch (error) {
    embedderDisabled = true;
    console.error(
      "[ShopDbEmbedding] Query embed failed, disabling for this process:",
      error?.message || error
    );
    return null;
  }
}

/** Test helper — force re-init on next getEmbedder(). */
function resetShopDbEmbedderForTests() {
  embedder = null;
  embedderDisabled = !EMBEDDING_ENABLED;
  vectorCache.clear();
  queryVectorCache.clear();
}

module.exports = {
  EMBEDDING_WEIGHT,
  EMBEDDING_MODEL,
  MAX_CANDIDATES,
  isEmbeddingSimilarityEnabled: () => !embedderDisabled,
  getShopDbEmbedder: getEmbedder,
  computeEmbeddingSimilarities,
  embedPassageTexts,
  embedQueryText,
  cosineSimilarity,
  resetShopDbEmbedderForTests,
};
