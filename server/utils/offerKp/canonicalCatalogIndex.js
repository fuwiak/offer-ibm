"use strict";

const fs = require("fs");
const path = require("path");
const { query } = require("./db/client");
const { TABLES } = require("./db/schema");
const {
  buildCanonicalProductText,
  buildProductSignature,
  canonicalTextHash,
  canonicalEmbeddingCacheKey,
} = require("./canonicalProductText");
const {
  embedPassageTexts,
  embedQueryText,
  cosineSimilarity,
  isEmbeddingSimilarityEnabled,
  EMBEDDING_MODEL,
} = require("./embeddingSimilarity");
const {
  loadVectorCheckpoint,
  appendVectorCheckpoint,
  clearVectorCheckpoint,
  acquireIndexSyncLock,
} = require("./canonicalVectorCheckpoint");
const {
  DEFAULT_VECTOR_DB_DIR,
  getShopDbVectorStore,
} = require("./shopDbVectorStore");
const { getShopDbHistoryStore } = require("./shopDbHistoryStore");
const shopDbLog = require("./shopDbLog");

/** v5 = v4 + sparse BM25 metadata (SKU, summary and description). */
const INDEX_VERSION = 5;
const DEFAULT_EMBEDDING_MODEL =
  EMBEDDING_MODEL || "MintplexLabs/multilingual-e5-small";
const INDEX_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR, "shopdb-index")
  : path.resolve(__dirname, "../../storage/shopdb-index");
const PRODUCTS_FILE = path.join(INDEX_DIR, "canonical-products.json");
const MANIFEST_FILE = path.join(INDEX_DIR, "manifest.json");
const VECTORS_FILE = path.join(INDEX_DIR, "canonical-vectors.bin");
const VECTOR_META_FILE = path.join(INDEX_DIR, "canonical-vectors.json");
const BATCH_SIZE = 500;
const EMBED_BATCH = Math.max(
  1,
  parseInt(process.env.SHOP_DB_CATALOG_EMBED_BATCH, 10) || 32
);

let catalogCache = null;
let catalogMapCache = null;
let syncPromise = null;
/** @type {{ ids: number[], dims: number, matrix: Float32Array }|null} */
let vectorIndexCache = null;
let vectorIndexInjectedForTests = false;

function enabled() {
  const raw = String(process.env.SHOP_DB_CANONICAL_INDEX ?? "1")
    .trim()
    .toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function denseEnabled() {
  if (!enabled()) return false;
  const raw = String(process.env.SHOP_DB_CATALOG_DENSE ?? "1")
    .trim()
    .toLowerCase();
  if (["0", "false", "off", "no"].includes(raw)) return false;
  return isEmbeddingSimilarityEnabled();
}

function denseTopK() {
  return Math.max(
    1,
    Math.min(200, parseInt(process.env.SHOP_DB_CATALOG_DENSE_TOP_K, 10) || 50)
  );
}

function optimizeVectorStoreOnSync() {
  const raw = String(process.env.SHOP_DB_VECTOR_OPTIMIZE_ON_SYNC ?? "0")
    .trim()
    .toLowerCase();
  return ["1", "true", "on", "yes"].includes(raw);
}

function verifyVectorHashesOnSync() {
  const raw = String(process.env.SHOP_DB_VECTOR_VERIFY_HASHES_ON_SYNC ?? "0")
    .trim()
    .toLowerCase();
  return ["1", "true", "on", "yes"].includes(raw);
}

function embeddingModel() {
  return (
    String(process.env.SHOP_DB_EMBEDDING_MODEL || "").trim() ||
    DEFAULT_EMBEDDING_MODEL
  );
}

function maxAgeMs() {
  const hours = Math.max(
    1,
    Number(process.env.SHOP_DB_CANONICAL_INDEX_MAX_AGE_HOURS) || 24
  );
  return hours * 60 * 60 * 1000;
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function getCanonicalCatalogManifest() {
  return readJson(MANIFEST_FILE, null);
}

function indexIsFresh() {
  const manifest = getCanonicalCatalogManifest();
  if (
    !manifest ||
    manifest.version !== INDEX_VERSION ||
    manifest.embeddingModel !== embeddingModel() ||
    Date.now() - new Date(manifest.createdAt).getTime() > maxAgeMs() ||
    !fs.existsSync(PRODUCTS_FILE)
  ) {
    return false;
  }
  if (denseEnabled() && !manifest.hasVectors) return false;
  if (
    manifest.hasVectors &&
    manifest.vectorStore === "lancedb" &&
    !fs.existsSync(DEFAULT_VECTOR_DB_DIR)
  ) {
    return false;
  }
  if (
    manifest.hasVectors &&
    manifest.vectorStore !== "lancedb" &&
    !fs.existsSync(VECTORS_FILE)
  ) {
    return false;
  }
  return true;
}

function getCanonicalCatalogRecords() {
  if (catalogCache) return catalogCache;
  const rows = readJson(PRODUCTS_FILE, []);
  catalogCache = Array.isArray(rows) ? rows : [];
  return catalogCache;
}

function getCanonicalCatalogMap() {
  if (!catalogMapCache) {
    catalogMapCache = new Map(
      getCanonicalCatalogRecords().map((row) => [Number(row.productId), row])
    );
  }
  return catalogMapCache;
}

function canonicalTextForProduct(product = {}) {
  const id = Number(product.id ?? product.productId);
  if (Number.isInteger(id) && id > 0) {
    const hit = getCanonicalCatalogMap().get(id);
    if (hit?.canonicalText) return hit.canonicalText;
  }
  return buildCanonicalProductText(product, []);
}

function signatureForProduct(product = {}) {
  const id = Number(product.id ?? product.productId);
  if (Number.isInteger(id) && id > 0) {
    const hit = getCanonicalCatalogMap().get(id);
    if (hit?.signature) return hit.signature;
  }
  if (product._signature) return product._signature;
  if (product.signature) return product.signature;
  return buildProductSignature(product, []);
}

async function fetchActiveProducts() {
  return query(`
    SELECT p.id, p.name, p.summary, p.description, c.name AS category_name,
           (
             SELECT GROUP_CONCAT(DISTINCT s.sku ORDER BY s.sort SEPARATOR ',')
             FROM ${TABLES.productSkus} s
             WHERE s.product_id = p.id AND s.sku <> ''
           ) AS sku_codes
    FROM ${TABLES.product} p
    LEFT JOIN ${TABLES.category} c ON c.id = p.category_id
    WHERE p.status = 1
    ORDER BY p.id
  `);
}

async function fetchProductFeatures(productIds) {
  const result = new Map();
  for (let offset = 0; offset < productIds.length; offset += BATCH_SIZE) {
    const ids = productIds.slice(offset, offset + BATCH_SIZE);
    const placeholders = ids.map(() => "?").join(",");
    const rows = await query(
      `
        SELECT pf.product_id, f.name, f.type,
               COALESCE(v.value, CAST(d.value AS CHAR)) AS value,
               d.unit
        FROM ${TABLES.productFeatures} pf
        INNER JOIN ${TABLES.feature} f ON f.id = pf.feature_id
        LEFT JOIN ${TABLES.featureValueVarchar} v
          ON f.type = 'varchar' AND v.id = pf.feature_value_id
        LEFT JOIN ${TABLES.featureValueDimension} d
          ON f.type LIKE 'dimension.%' AND d.id = pf.feature_value_id
        WHERE pf.product_id IN (${placeholders})
        ORDER BY pf.product_id, f.id
      `,
      ids
    );
    for (const row of rows) {
      const id = Number(row.product_id);
      if (!result.has(id)) result.set(id, []);
      result.get(id).push(row);
    }
  }
  return result;
}

function writeAtomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), "utf8");
  fs.renameSync(temporary, file);
}

function writeAtomicBinary(file, buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, buffer);
  fs.renameSync(temporary, file);
}

function loadPreviousVectorIndex() {
  const meta = readJson(VECTOR_META_FILE, null);
  if (
    !meta ||
    !Array.isArray(meta.ids) ||
    !meta.dims ||
    meta.embeddingModel !== embeddingModel() ||
    !fs.existsSync(VECTORS_FILE)
  ) {
    return null;
  }
  const expectedBytes = meta.ids.length * meta.dims * 4;
  const buf = fs.readFileSync(VECTORS_FILE);
  if (buf.length < expectedBytes) return null;
  const copy = Buffer.allocUnsafe(expectedBytes);
  buf.copy(copy, 0, 0, expectedBytes);
  const matrix = new Float32Array(
    copy.buffer,
    copy.byteOffset,
    meta.ids.length * meta.dims
  );
  const byId = new Map();
  meta.ids.forEach((id, index) => {
    const start = index * meta.dims;
    byId.set(Number(id), {
      hash: meta.hashes?.[index] || null,
      vector: matrix.subarray(start, start + meta.dims),
    });
  });
  return { meta, byId };
}

/**
 * Embed missing canonical texts; reuse previous vectors when hash matches.
 */
async function buildVectorMatrix(
  records,
  { vectorStore = null, historyStore = null, syncId = null } = {}
) {
  if (!denseEnabled() || !records.length) return null;

  const previous = loadPreviousVectorIndex();
  const checkpoint = loadVectorCheckpoint(INDEX_DIR, embeddingModel());
  const recordById = new Map(
    records.map((record) => [Number(record.productId), record])
  );
  const reused = [];
  const toEmbed = [];
  let vectorStoreWrites = 0;

  for (const record of records) {
    const productId = Number(record.productId);
    const prev =
      checkpoint?.byId.get(productId) || previous?.byId.get(productId);
    if (prev?.hash === record.hash && prev.vector?.length) {
      reused.push({ id: productId, vector: prev.vector });
    } else {
      toEmbed.push(record);
    }
  }

  if (checkpoint?.meta?.count) {
    shopDbLog.ok("catalog dense checkpoint resumed", {
      checkpointVectors: checkpoint.meta.count,
      reusableVectors: reused.length,
      remaining: toEmbed.length,
    });
  }

  const previousManifest = getCanonicalCatalogManifest();
  const trustedCompleteVectorStore =
    previousManifest?.hasVectors === true &&
    previousManifest?.vectorStore === "lancedb" &&
    Number(previousManifest?.vectorCount) === records.length &&
    Number(previous?.meta?.count) === records.length;

  if (
    vectorStore &&
    reused.length &&
    (!trustedCompleteVectorStore || verifyVectorHashesOnSync())
  ) {
    const stored = new Map(
      (await vectorStore.metadata()).map((row) => [
        Number(row.productId),
        String(row.hash || ""),
      ])
    );
    const migrationRows = reused
      .filter((row) => stored.get(row.id) !== recordById.get(row.id)?.hash)
      .map((row) => ({
        productId: row.id,
        hash: recordById.get(row.id).hash,
        canonicalText: recordById.get(row.id).canonicalText,
        vector: row.vector,
      }));
    for (let offset = 0; offset < migrationRows.length; offset += EMBED_BATCH) {
      const batch = migrationRows.slice(offset, offset + EMBED_BATCH);
      await vectorStore.upsert(batch);
      vectorStoreWrites += batch.length;
      await historyStore?.recordEmbeddingBatch(
        syncId,
        batch,
        embeddingModel(),
        "migrated"
      );
    }
    if (migrationRows.length) {
      shopDbLog.ok("catalog checkpoint migrated to LanceDB", {
        vectors: migrationRows.length,
      });
    }
  }

  /** @type {Map<number, Float32Array|number[]>} */
  const fresh = new Map();
  for (let offset = 0; offset < toEmbed.length; offset += EMBED_BATCH) {
    const batch = toEmbed.slice(offset, offset + EMBED_BATCH);
    const vectors = await embedPassageTexts(
      batch.map((row) => row.canonicalText)
    );
    if (!vectors?.length) {
      shopDbLog.warn("catalog dense embed batch failed — skipping vectors", {
        offset,
        batch: batch.length,
      });
      return null;
    }
    const checkpointRows = [];
    batch.forEach((row, idx) => {
      if (!vectors[idx]?.length) return;
      const productId = Number(row.productId);
      fresh.set(productId, vectors[idx]);
      checkpointRows.push({
        productId,
        hash: row.hash,
        vector: vectors[idx],
      });
    });
    appendVectorCheckpoint(INDEX_DIR, embeddingModel(), checkpointRows);
    const persistentRows = checkpointRows.map((row) => ({
      ...row,
      canonicalText: recordById.get(row.productId)?.canonicalText || "",
    }));
    await vectorStore?.upsert(persistentRows);
    vectorStoreWrites += persistentRows.length;
    await historyStore?.recordEmbeddingBatch(
      syncId,
      persistentRows,
      embeddingModel(),
      "embedded"
    );
    shopDbLog.ok("catalog dense embed progress", {
      done: Math.min(offset + batch.length, toEmbed.length),
      total: toEmbed.length,
      reused: reused.length,
      checkpointed: checkpointRows.length,
    });
  }

  const dims =
    reused[0]?.vector?.length ||
    fresh.values().next().value?.length ||
    previous?.meta?.dims ||
    0;
  if (!dims) return null;

  const reusedById = new Map(reused.map((row) => [row.id, row.vector]));
  const ordered = [];
  for (const record of records) {
    const id = Number(record.productId);
    const vector = fresh.get(id) || reusedById.get(id) || null;
    if (!vector || vector.length !== dims) continue;
    ordered.push({ id, vector, hash: record.hash });
  }
  if (!ordered.length) return null;

  const matrix = new Float32Array(ordered.length * dims);
  ordered.forEach((row, index) => {
    matrix.set(
      row.vector instanceof Float32Array
        ? row.vector
        : Float32Array.from(row.vector),
      index * dims
    );
  });

  const result = {
    ids: ordered.map((row) => row.id),
    hashes: ordered.map((row) => row.hash),
    dims,
    matrix,
    embedded: fresh.size,
    reused: reused.length,
  };
  // LanceDB compaction is expensive even for an unchanged 20k-row table.
  // Metadata-only catalog upgrades (for example v4 → v5 BM25 fields) reuse
  // every vector, so there is nothing to compact.
  if (vectorStoreWrites > 0 && optimizeVectorStoreOnSync()) {
    await vectorStore?.optimize();
  }
  return result;
}

function persistVectorMatrix(vectorBuild) {
  if (!vectorBuild) return false;
  const { ids, hashes, dims, matrix } = vectorBuild;
  writeAtomicBinary(
    VECTORS_FILE,
    Buffer.from(matrix.buffer, matrix.byteOffset, matrix.byteLength)
  );
  writeAtomicJson(VECTOR_META_FILE, {
    embeddingModel: embeddingModel(),
    dims,
    count: ids.length,
    ids,
    hashes,
    createdAt: new Date().toISOString(),
  });
  vectorIndexCache = { ids, dims, matrix };
  clearVectorCheckpoint(INDEX_DIR);
  return true;
}

function loadVectorIndex() {
  if (vectorIndexCache) return vectorIndexCache;
  const meta = readJson(VECTOR_META_FILE, null);
  if (
    !meta ||
    !Array.isArray(meta.ids) ||
    !meta.dims ||
    !fs.existsSync(VECTORS_FILE)
  ) {
    return null;
  }
  const expected = meta.ids.length * meta.dims * 4;
  const buf = fs.readFileSync(VECTORS_FILE);
  if (buf.length < expected) return null;
  const copy = Buffer.allocUnsafe(expected);
  buf.copy(copy, 0, 0, expected);
  const matrix = new Float32Array(
    copy.buffer,
    copy.byteOffset,
    meta.ids.length * meta.dims
  );
  vectorIndexCache = {
    ids: meta.ids.map(Number),
    dims: meta.dims,
    matrix,
  };
  return vectorIndexCache;
}

/**
 * Full-catalog dense retrieval (CPU cosine). Candidate source only — not exact.
 */
async function searchCanonicalCatalogDense(queryText, topK = denseTopK()) {
  if (!denseEnabled()) return [];
  const index = loadVectorIndex();
  const queryVector = await embedQueryText(queryText);
  if (!queryVector?.length) return [];
  const limit = Math.max(1, Math.min(200, Number(topK) || denseTopK()));
  const catalogMap = getCanonicalCatalogMap();

  if (!vectorIndexInjectedForTests) {
    try {
      const hits = await getShopDbVectorStore(embeddingModel()).search(
        queryVector,
        limit
      );
      if (hits.length) {
        return hits.map((row) => ({
          ...row,
          score: Number(row.score.toFixed(4)),
          canonicalText: catalogMap.get(row.productId)?.canonicalText || null,
        }));
      }
    } catch (error) {
      shopDbLog.warn("LanceDB catalog search failed — using matrix fallback", {
        error: error?.message || String(error),
      });
    }
  }

  if (!index?.ids?.length || queryVector.length !== index.dims) {
    scheduleCanonicalCatalogSync();
    return [];
  }

  const scored = [];
  for (let i = 0; i < index.ids.length; i++) {
    const start = i * index.dims;
    const vector = index.matrix.subarray(start, start + index.dims);
    scored.push({
      productId: index.ids[i],
      score: cosineSimilarity(queryVector, vector),
    });
  }
  scored.sort((a, b) => b.score - a.score || a.productId - b.productId);
  return scored.slice(0, limit).map((row) => ({
    ...row,
    score: Number(row.score.toFixed(4)),
    canonicalText: catalogMap.get(row.productId)?.canonicalText || null,
  }));
}

async function syncCanonicalCatalogIndex({ force = false } = {}) {
  if (!enabled()) return { skipped: true, reason: "disabled" };
  if (!force && indexIsFresh()) {
    return {
      skipped: true,
      reason: "fresh",
      manifest: getCanonicalCatalogManifest(),
    };
  }
  if (syncPromise) return syncPromise;
  const releaseLock = acquireIndexSyncLock(INDEX_DIR);
  if (!releaseLock) {
    return { skipped: true, reason: "locked" };
  }

  let historyStore = null;
  let syncId = null;
  syncPromise = (async () => {
    try {
      const startedAt = Date.now();
      const modelId = embeddingModel();
      historyStore = getShopDbHistoryStore();
      syncId = await historyStore.startSync({
        modelId,
        indexVersion: INDEX_VERSION,
      });
      const products = await fetchActiveProducts();
      const features = await fetchProductFeatures(
        products.map((product) => Number(product.id))
      );
      const records = products.map((product) => {
        const featureRows = features.get(Number(product.id)) || [];
        const canonicalText = buildCanonicalProductText(product, featureRows);
        const signature = buildProductSignature(product, featureRows);
        const hash = canonicalTextHash(canonicalText);
        return {
          productId: Number(product.id),
          name: product.name,
          categoryName: product.category_name || null,
          skuCodes: String(product.sku_codes || "")
            .split(",")
            .map((sku) => sku.trim())
            .filter(Boolean),
          summary: String(product.summary || "").slice(0, 2_000),
          description: String(product.description || "").slice(0, 4_000),
          canonicalText,
          signature,
          hash,
          embeddingCacheKey: canonicalEmbeddingCacheKey(
            modelId,
            product.id,
            canonicalText
          ),
        };
      });
      await historyStore.recordProductVersions(records, modelId);

      let vectorBuild = null;
      let hasVectors = false;
      const vectorStore = getShopDbVectorStore(modelId);
      if (denseEnabled()) {
        vectorBuild = await buildVectorMatrix(records, {
          vectorStore,
          historyStore,
          syncId,
        });
        hasVectors = persistVectorMatrix(vectorBuild);
      } else {
        try {
          if (fs.existsSync(VECTORS_FILE)) fs.unlinkSync(VECTORS_FILE);
          if (fs.existsSync(VECTOR_META_FILE)) fs.unlinkSync(VECTOR_META_FILE);
        } catch {
          /* ignore */
        }
        clearVectorCheckpoint(INDEX_DIR);
        vectorIndexCache = null;
      }

      if (denseEnabled()) {
        await vectorStore.removeMissing(
          records.map((record) => record.productId)
        );
      }
      const vectorCount = denseEnabled() ? await vectorStore.count() : 0;
      const manifest = {
        version: INDEX_VERSION,
        embeddingModel: modelId,
        productCount: records.length,
        hasVectors: hasVectors && vectorCount === records.length,
        vectorStore: "lancedb",
        vectorDatabaseDir: DEFAULT_VECTOR_DB_DIR,
        historyDatabase: historyStore.databaseFile,
        vectorCount,
        vectorDims: vectorBuild?.dims || 0,
        vectorsEmbedded: vectorBuild?.embedded || 0,
        vectorsReused: vectorBuild?.reused || 0,
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      };
      writeAtomicJson(PRODUCTS_FILE, records);
      writeAtomicJson(MANIFEST_FILE, manifest);
      catalogCache = records;
      catalogMapCache = new Map(
        records.map((row) => [Number(row.productId), row])
      );
      await historyStore.completeSync(syncId, {
        productCount: records.length,
        embeddedCount: vectorBuild?.embedded || 0,
        reusedCount: vectorBuild?.reused || 0,
      });
      shopDbLog.ok("canonical catalog index synced", manifest);
      return { skipped: false, manifest, records };
    } catch (error) {
      await historyStore?.failSync(syncId, error);
      throw error;
    }
  })().finally(() => {
    syncPromise = null;
    releaseLock();
  });
  return syncPromise;
}

function scheduleCanonicalCatalogSync() {
  if (!enabled() || indexIsFresh() || syncPromise) return;
  setImmediate(() => {
    syncCanonicalCatalogIndex().catch((error) => {
      shopDbLog.warn("canonical catalog sync failed", {
        error: error?.message || String(error),
      });
    });
  });
}

function resetCanonicalCatalogCaches() {
  catalogCache = null;
  catalogMapCache = null;
  vectorIndexCache = null;
  vectorIndexInjectedForTests = false;
  syncPromise = null;
  try {
    require("./shopDbBm25Index").resetShopDbBm25Index();
  } catch {
    /* optional sparse index */
  }
}

function setVectorIndexForTests(index) {
  vectorIndexCache = index;
  vectorIndexInjectedForTests = true;
}

module.exports = {
  INDEX_VERSION,
  INDEX_DIR,
  PRODUCTS_FILE,
  MANIFEST_FILE,
  VECTORS_FILE,
  VECTOR_META_FILE,
  embeddingModel,
  denseEnabled,
  denseTopK,
  optimizeVectorStoreOnSync,
  verifyVectorHashesOnSync,
  indexIsFresh,
  getCanonicalCatalogManifest,
  getCanonicalCatalogRecords,
  getCanonicalCatalogMap,
  canonicalTextForProduct,
  signatureForProduct,
  searchCanonicalCatalogDense,
  syncCanonicalCatalogIndex,
  scheduleCanonicalCatalogSync,
  resetCanonicalCatalogCaches,
  setVectorIndexForTests,
  loadVectorIndex,
};
