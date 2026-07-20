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

/** @type {Map<string|number, { vector: number[], expiresAt: number }>} */
const vectorCache = new Map();

function cacheGet(productId) {
  const entry = vectorCache.get(productId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    vectorCache.delete(productId);
    return null;
  }
  vectorCache.delete(productId);
  vectorCache.set(productId, entry);
  return entry.vector;
}

function cacheSet(productId, vector) {
  if (vectorCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = vectorCache.keys().next().value;
    if (oldest !== undefined) vectorCache.delete(oldest);
  }
  vectorCache.set(productId, { vector, expiresAt: Date.now() + CACHE_TTL_MS });
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
  const toEmbedIds = [];
  for (const c of pool) {
    if (c?.id == null) continue;
    if (cacheGet(c.id) != null) continue;
    toEmbed.push(`${passagePrefix}${String(c.name || "").trim()}`);
    toEmbedIds.push(c.id);
  }

  try {
    if (toEmbed.length) {
      const vectors = await active.embedChunks(toEmbed);
      if (Array.isArray(vectors)) {
        toEmbedIds.forEach((id, idx) => {
          if (vectors[idx]) cacheSet(id, vectors[idx]);
        });
      }
    }

    const queryVector = await active.embedTextInput(text);
    if (!queryVector?.length) return new Map();

    const result = new Map();
    for (const c of pool) {
      if (c?.id == null) continue;
      const vector = cacheGet(c.id);
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

module.exports = {
  EMBEDDING_WEIGHT,
  isEmbeddingSimilarityEnabled: () => !embedderDisabled,
  computeEmbeddingSimilarities,
  cosineSimilarity,
};
