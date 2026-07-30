"use strict";

/**
 * OfferKP experience memory.
 *
 * Every pipeline action may be written to the append-only event log, while only
 * compact, task-specific records are embedded. Namespaces are deliberately
 * separate so intent examples never leak into OCR/product matching prompts.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  resolveOpenRouterApiKey,
  resolveOpenRouterBaseUrl,
  resolveOpenRouterHeaders,
} = require("../offerKpApp/openRouterEnv");
const { offerKpLog } = require("../offerKpApp/offerKpLog");

const MEMORY_NAMESPACES = new Set([
  "intent_memory",
  "document_layout_memory",
  "extraction_example_memory",
  "field_correction_memory",
  "line_split_memory",
  "quantity_unit_memory",
  "match_correction_memory",
  "negative_memory",
  "failure_memory",
]);

const POSITIVE_RETRIEVAL_TRUST = new Set([
  "golden_verified",
  "operator_confirmed",
  "rule_verified",
  "teacher_verified_by_code",
]);

const MEMORY_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR, "metrics")
  : path.resolve(__dirname, "../../storage/metrics");
const EVENT_FILE = path.join(MEMORY_DIR, "experience-events.jsonl");
const MEMORY_FILE = path.join(MEMORY_DIR, "experience-memory.jsonl");
const DEFAULT_EMBEDDING_MODEL = "qwen/qwen3-embedding-0.6b";
const MAX_FILE_BYTES = Math.max(
  1_000_000,
  Number(process.env.OFFER_KP_MEMORY_MAX_BYTES) || 50_000_000
);

let memoryCache = null;
let dirEnsured = false;

function enabled() {
  const raw = String(process.env.OFFER_KP_EXPERIENCE_MEMORY ?? "1")
    .trim()
    .toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function embeddingModel() {
  return (
    String(process.env.OFFER_KP_MEMORY_EMBEDDING_MODEL || "").trim() ||
    DEFAULT_EMBEDDING_MODEL
  );
}

function embeddingVersion() {
  return Math.max(
    1,
    Number(process.env.OFFER_KP_MEMORY_EMBEDDING_VERSION) || 1
  );
}

function ensureDir() {
  if (dirEnsured) return;
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  dirEnsured = true;
}

function rotateIfNeeded(file) {
  try {
    if (fs.statSync(file).size <= MAX_FILE_BYTES) return;
    const backup = `${file}.1`;
    fs.rmSync(backup, { force: true });
    fs.renameSync(file, backup);
    if (file === MEMORY_FILE) memoryCache = null;
  } catch {
    // First write or best-effort metrics storage.
  }
}

function appendJsonLine(file, value) {
  ensureDir();
  rotateIfNeeded(file);
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}

function createId() {
  return crypto.randomUUID();
}

function recordExperienceEvent(eventType, payload = {}) {
  if (!enabled()) return null;
  const event = {
    id: createId(),
    ts: new Date().toISOString(),
    event_type: String(eventType || "unknown"),
    ...payload,
  };
  try {
    appendJsonLine(EVENT_FILE, event);
    return event;
  } catch (error) {
    offerKpLog("warn", "Experience event write failed", {
      eventType,
      error: error?.message || String(error),
    });
    return null;
  }
}

async function embedTexts(inputs) {
  const texts = (Array.isArray(inputs) ? inputs : [inputs]).map((value) =>
    String(value || "").slice(0, 12_000)
  );
  if (!texts.length || texts.some((text) => !text.trim())) return [];
  const apiKey = resolveOpenRouterApiKey();
  if (!apiKey) return [];

  const response = await fetch(`${resolveOpenRouterBaseUrl()}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...resolveOpenRouterHeaders(),
    },
    body: JSON.stringify({
      model: embeddingModel(),
      input: texts,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      body?.error?.message || body?.message || `HTTP ${response.status}`
    );
  }
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    .map((row) => row.embedding)
    .filter(Array.isArray);
}

function normalizeMemoryRecord(input, vector) {
  const namespace = String(input.namespace || "").trim();
  const retrievalText = String(input.retrievalText || "").trim();
  if (!MEMORY_NAMESPACES.has(namespace)) {
    throw new Error(`Unsupported experience memory namespace: ${namespace}`);
  }
  if (!retrievalText) throw new Error("retrievalText required");
  return {
    id: input.id || createId(),
    namespace,
    embedding_model: embeddingModel(),
    embedding_version: embeddingVersion(),
    retrieval_text: retrievalText,
    canonical_text: input.canonicalText
      ? String(input.canonicalText).trim()
      : null,
    payload:
      input.payload && typeof input.payload === "object" ? input.payload : {},
    trust_level: String(input.trustLevel || "automatic_prediction"),
    source_event_id: input.sourceEventId || null,
    created_at: new Date().toISOString(),
    is_active: true,
    embedding: vector,
  };
}

async function rememberExperience(input = {}) {
  if (!enabled()) return null;
  try {
    const [vector] = await embedTexts(input.retrievalText);
    if (!vector?.length) return null;
    const record = normalizeMemoryRecord(input, vector);
    appendJsonLine(MEMORY_FILE, record);
    if (memoryCache) memoryCache.push(record);
    return record;
  } catch (error) {
    offerKpLog("warn", "Experience memory write failed", {
      namespace: input.namespace || null,
      error: error?.message || String(error),
    });
    return null;
  }
}

function rememberExperienceAsync(input = {}) {
  setImmediate(() => {
    rememberExperience(input).catch(() => null);
  });
}

function captureIntentDecision(text, routed = {}, { source = "router" } = {}) {
  const input = String(text || "").trim();
  const intent = String(routed?.primaryIntent || "").trim();
  if (!input || !intent) return null;
  const isLlm = routed?.signals?.llmJudge === true;
  const trustLevel = isLlm
    ? "teacher_verified_by_code"
    : Number(routed?.confidence || 0) >= 0.75
      ? "rule_verified"
      : "automatic_prediction";
  const event = recordExperienceEvent("intent_decision", {
    input: input.slice(0, 2_000),
    output: intent,
    confidence: routed?.confidence ?? null,
    pipeline_stage: "intent",
    source,
    trust_level: trustLevel,
  });
  rememberExperienceAsync({
    namespace: "intent_memory",
    retrievalText: `USER_TEXT: ${input}\nINTENT_MEANING: ${intent}`,
    canonicalText: intent,
    payload: { user_text: input, intent },
    trustLevel,
    sourceEventId: event?.id || null,
  });
  return event;
}

function loadMemory() {
  if (memoryCache) return memoryCache;
  let raw = "";
  try {
    raw = fs.readFileSync(MEMORY_FILE, "utf8");
  } catch {
    memoryCache = [];
    return memoryCache;
  }
  memoryCache = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return memoryCache;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

async function retrieveExperiences(
  namespace,
  queryText,
  { limit = 3, minSimilarity = 0.55, trustLevels = null } = {}
) {
  if (!enabled() || !MEMORY_NAMESPACES.has(namespace) || !queryText) return [];
  const allowedTrust = trustLevels
    ? new Set(trustLevels)
    : POSITIVE_RETRIEVAL_TRUST;
  const candidates = loadMemory().filter(
    (row) =>
      row.namespace === namespace &&
      row.is_active !== false &&
      row.embedding_model === embeddingModel() &&
      Number(row.embedding_version) === embeddingVersion() &&
      allowedTrust.has(row.trust_level)
  );
  if (!candidates.length) return [];

  try {
    const [queryVector] = await embedTexts(queryText);
    if (!queryVector?.length) return [];
    return candidates
      .map((row) => ({
        ...row,
        score: cosineSimilarity(queryVector, row.embedding),
      }))
      .filter((row) => row.score >= minSimilarity)
      .sort(
        (a, b) =>
          b.score - a.score ||
          String(b.created_at).localeCompare(String(a.created_at))
      )
      .slice(0, Math.max(0, limit));
  } catch (error) {
    offerKpLog("warn", "Experience memory retrieval failed", {
      namespace,
      error: error?.message || String(error),
    });
    return [];
  }
}

function getExperienceMemoryStats() {
  const records = loadMemory();
  const namespaces = {};
  for (const row of records) {
    namespaces[row.namespace] = (namespaces[row.namespace] || 0) + 1;
  }
  return {
    enabled: enabled(),
    embeddingModel: embeddingModel(),
    embeddingVersion: embeddingVersion(),
    total: records.length,
    namespaces,
    eventFile: EVENT_FILE,
    memoryFile: MEMORY_FILE,
  };
}

module.exports = {
  MEMORY_NAMESPACES,
  POSITIVE_RETRIEVAL_TRUST,
  DEFAULT_EMBEDDING_MODEL,
  EVENT_FILE,
  MEMORY_FILE,
  embeddingModel,
  embeddingVersion,
  recordExperienceEvent,
  rememberExperience,
  rememberExperienceAsync,
  captureIntentDecision,
  retrieveExperiences,
  cosineSimilarity,
  getExperienceMemoryStats,
};
