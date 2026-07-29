"use strict";

/**
 * Runtime operator learning store — examples promoted from the UI
 * ("В обучение" / teach button). Persisted as JSONL under STORAGE_DIR;
 * merged into golden override + few-shot embedding retrieval so matching
 * improves on the next identical / similar inquiry without redeploying CSV.
 *
 * Not a weight fine-tune: same learning stack as goldenCorrections /
 * goldenFewShot (exact override + embedding-ranked few-shot for LLM fallback).
 * Price still always comes from live ShopDB by SKU.
 */

const fs = require("fs");
const path = require("path");
const { normalizeSearchText, foldHomoglyphs } = require("./textNormalize");

function envFlagEnabled(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return !["0", "false", "no", "off"].includes(
    String(raw).trim().toLowerCase()
  );
}

const LEARNING_ENABLED = envFlagEnabled("SHOP_DB_OPERATOR_LEARNING", true);
const VALID_MATCH_TYPES = new Set(["exact", "analog", "none"]);

const LEARNING_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR, "metrics")
  : path.resolve(__dirname, "../../storage/metrics");
const LEARNING_FILE = path.join(LEARNING_DIR, "operator-learning.jsonl");

const MAX_FILE_BYTES = Math.max(
  1_000_000,
  parseInt(process.env.SHOP_DB_OPERATOR_LEARNING_MAX_BYTES, 10) || 20_000_000
);

/** @type {Map<string, object>|null} */
let index = null;
let dirEnsured = false;

function normalizeKey(text) {
  return normalizeSearchText(foldHomoglyphs(String(text || "")));
}

function ensureDir() {
  if (dirEnsured) return;
  try {
    fs.mkdirSync(LEARNING_DIR, { recursive: true });
  } catch {
    /* best-effort */
  }
  dirEnsured = true;
}

function rotateIfNeeded() {
  try {
    const stat = fs.statSync(LEARNING_FILE);
    if (stat.size > MAX_FILE_BYTES) {
      const backup = `${LEARNING_FILE}.1`;
      fs.rmSync(backup, { force: true });
      fs.renameSync(LEARNING_FILE, backup);
    }
  } catch {
    /* first write */
  }
}

function rowFromRecord(rec) {
  if (!rec || typeof rec !== "object") return null;
  const sourceName = String(rec.sourceName || "").trim();
  if (!sourceName) return null;
  const matchType = String(rec.matchType || "").trim().toLowerCase();
  if (!VALID_MATCH_TYPES.has(matchType)) return null;
  const sku = rec.sku != null ? String(rec.sku).trim() : "";
  if (!sku && matchType !== "none") return null;
  return {
    sourceName,
    sku: sku || null,
    matchedName: rec.matchedName ? String(rec.matchedName).trim() : null,
    matchType,
    sourceFile: "operator",
    productId: rec.productId != null ? String(rec.productId) : null,
    ts: rec.ts || null,
  };
}

function loadOperatorLearning() {
  const map = new Map();
  if (!LEARNING_ENABLED) return map;
  let raw;
  try {
    raw = fs.readFileSync(LEARNING_FILE, "utf8");
  } catch {
    return map;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const row = rowFromRecord(rec);
    if (!row) continue;
    // Later lines overwrite earlier ones for the same normalized query.
    map.set(normalizeKey(row.sourceName), row);
  }
  return map;
}

function getIndex() {
  if (!index) index = loadOperatorLearning();
  return index;
}

function reloadOperatorLearning() {
  index = loadOperatorLearning();
  return index;
}

/**
 * @param {string[]} candidateTexts
 * @returns {object|null}
 */
function findOperatorLearning(candidateTexts = []) {
  if (!LEARNING_ENABLED) return null;
  const map = getIndex();
  if (!map.size) return null;
  for (const text of candidateTexts) {
    if (!text) continue;
    const hit = map.get(normalizeKey(text));
    if (hit) return hit;
  }
  return null;
}

/** Positive examples for few-shot embedding retrieval. */
function listOperatorLearningExamples() {
  if (!LEARNING_ENABLED) return [];
  return [...getIndex().values()].filter(
    (row) => row.matchType !== "none" && row.sku
  );
}

function inferMatchType(example = {}) {
  const raw = String(example.matchType || "").trim().toLowerCase();
  if (VALID_MATCH_TYPES.has(raw)) return raw;
  const status = String(example.status || "").toLowerCase();
  if (/аналог|analog|zamiennik/.test(status)) return "analog";
  if (!example.sku && !example.article) return "none";
  return "exact";
}

/**
 * Normalize one teach payload from the UI / API.
 * @returns {{ok:true, record:object}|{ok:false, error:string}}
 */
function normalizeTeachExample(example = {}) {
  const sourceName = String(
    example.sourceName ||
      example.inquiryRaw ||
      example.requestedName ||
      example.name ||
      ""
  ).trim();
  if (!sourceName) {
    return { ok: false, error: "sourceName required" };
  }
  const sku = String(example.sku || example.article || "").trim();
  const matchType = inferMatchType({ ...example, sku });
  if (!sku && matchType !== "none") {
    return { ok: false, error: "sku required unless matchType=none" };
  }
  const matchedName = String(
    example.matchedName || example.name || example.productName || ""
  ).trim();
  const record = {
    ts: new Date().toISOString(),
    sourceName,
    sku: sku || null,
    matchedName: matchedName || null,
    matchType,
    productId:
      example.productId != null && example.productId !== ""
        ? String(example.productId)
        : null,
    threadSlug: example.threadSlug || null,
    quoteReference: example.quoteReference || null,
    lineIndex: example.lineIndex ?? null,
    userId: example.userId != null ? Number(example.userId) : null,
    sourceFile: "operator",
  };
  return { ok: true, record };
}

/**
 * Persist operator-confirmed matches and refresh in-memory index.
 * Optionally warms embedding cache so few-shot can use them immediately.
 *
 * @param {object[]} examples
 * @param {{userId?: number|null, warmEmbeddings?: boolean}} [opts]
 */
async function teachExamples(examples = [], opts = {}) {
  if (!LEARNING_ENABLED) {
    return { success: false, error: "operator learning disabled", taught: 0 };
  }
  const list = Array.isArray(examples) ? examples : [examples];
  const taught = [];
  const errors = [];

  ensureDir();
  rotateIfNeeded();

  for (const raw of list) {
    const normalized = normalizeTeachExample({
      ...raw,
      userId: raw.userId ?? opts.userId,
    });
    if (!normalized.ok) {
      errors.push(normalized.error);
      continue;
    }
    const { record } = normalized;
    try {
      fs.appendFileSync(LEARNING_FILE, `${JSON.stringify(record)}\n`, "utf8");
    } catch (error) {
      errors.push(error?.message || String(error));
      continue;
    }
    getIndex().set(normalizeKey(record.sourceName), {
      sourceName: record.sourceName,
      sku: record.sku,
      matchedName: record.matchedName,
      matchType: record.matchType,
      sourceFile: "operator",
      productId: record.productId,
      ts: record.ts,
    });
    taught.push(record);
  }

  if (opts.warmEmbeddings !== false && taught.length) {
    warmEmbeddingsAsync(taught);
  }

  return {
    success: taught.length > 0,
    taught: taught.length,
    total: getIndex().size,
    examples: taught.map((r) => ({
      sourceName: r.sourceName,
      sku: r.sku,
      matchType: r.matchType,
    })),
    errors: errors.length ? errors : undefined,
  };
}

function warmEmbeddingsAsync(records) {
  setImmediate(() => {
    Promise.resolve()
      .then(async () => {
        const {
          computeEmbeddingSimilarities,
        } = require("./embeddingSimilarity");
        const candidates = records
          .filter((r) => r.matchType !== "none" && r.sourceName)
          .map((r, i) => ({
            id: `operator:${normalizeKey(r.sourceName)}:${i}`,
            name: r.sourceName,
          }));
        if (!candidates.length) return;
        // Embed passages into the shared cache; query text is unused for warm.
        await computeEmbeddingSimilarities(candidates[0].name, candidates);
      })
      .catch((error) => {
        console.error(
          "[OperatorLearning] embedding warm failed:",
          error?.message || error
        );
      });
  });
}

function getOperatorLearningStats() {
  const map = getIndex();
  let positive = 0;
  let none = 0;
  for (const row of map.values()) {
    if (row.matchType === "none") none += 1;
    else positive += 1;
  }
  return {
    enabled: LEARNING_ENABLED,
    total: map.size,
    positive,
    none,
    file: LEARNING_FILE,
  };
}

module.exports = {
  teachExamples,
  findOperatorLearning,
  listOperatorLearningExamples,
  reloadOperatorLearning,
  getOperatorLearningStats,
  normalizeTeachExample,
  isOperatorLearningEnabled: () => LEARNING_ENABLED,
  LEARNING_FILE,
};
