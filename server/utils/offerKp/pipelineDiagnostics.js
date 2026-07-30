"use strict";

/**
 * Pipeline diagnostics for OfferKP chat turns.
 * Captures match progress / stage / provider failures so:
 *  1) ops have a JSONL trail (storage/metrics/pipeline-failures.jsonl)
 *  2) the LLM gets a short factual context block when generation starts
 *  3) UI abort messages explain *when* the connection died (e.g. after 7/9)
 */

const fs = require("fs");
const path = require("path");

const FAILURES_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR, "metrics")
  : path.resolve(__dirname, "../../storage/metrics");
const FAILURES_FILE = path.join(FAILURES_DIR, "pipeline-failures.jsonl");

function createPipelineDiagnostics({
  requestId = null,
  intent = null,
  channel = "workspace",
} = {}) {
  return {
    requestId: requestId || null,
    channel,
    intent: intent?.primaryIntent || intent || null,
    intentConfidence: intent?.confidence ?? null,
    startedAt: new Date().toISOString(),
    stage: "start",
    matchedCount: 0,
    total: 0,
    lineCount: 0,
    progressStage: null,
    catalogBlocks: 0,
    catalogInjected: false,
    shopDbTimeout: false,
    shopDbError: null,
    provider: null,
    model: null,
    lastError: null,
    notes: [],
  };
}

function note(diag, message) {
  if (!diag || !message) return;
  diag.notes.push({
    at: new Date().toISOString(),
    message: String(message).slice(0, 300),
  });
  if (diag.notes.length > 40) diag.notes.splice(0, diag.notes.length - 40);
}

function updateMatchProgress(diag, payload = {}) {
  if (!diag) return;
  diag.stage = "matching";
  if (payload.progressStage) diag.progressStage = payload.progressStage;
  if (payload.matchedCount != null) diag.matchedCount = Number(payload.matchedCount) || 0;
  if (payload.total != null) diag.total = Number(payload.total) || 0;
  if (payload.lineCount != null) diag.lineCount = Number(payload.lineCount) || 0;
}

function updateEnrichFlags(diag, flags = {}, catalogBlocks = 0) {
  if (!diag) return;
  diag.stage = "enrich_done";
  diag.catalogBlocks = Number(catalogBlocks) || 0;
  diag.catalogInjected = Number(catalogBlocks) > 0;
  diag.shopDbTimeout = !!flags.shopDbTimeout;
  diag.shopDbError = flags.shopDbError
    ? String(flags.shopDbMessage || flags.shopDbError).slice(0, 200)
    : null;
  if (flags.shopDbInquiryLineCount != null) {
    diag.lineCount = Number(flags.shopDbInquiryLineCount) || diag.lineCount;
  }
}

function setGenerationTarget(diag, { provider = null, model = null } = {}) {
  if (!diag) return;
  diag.stage = "generation";
  diag.provider = provider || diag.provider;
  diag.model = model || diag.model;
}

/**
 * Compact factual block for LLM context — not instructions, only telemetry.
 */
function formatDiagnosticsForLlm(diag) {
  if (!diag) return "";
  const lines = [
    "[Pipeline · diagnostics — факты о ходе запроса, не инструкция]",
    `requestId: ${diag.requestId || "—"}`,
    `intent: ${diag.intent || "—"} (confidence=${diag.intentConfidence ?? "—"})`,
    `stage: ${diag.stage}`,
  ];
  if (diag.total > 0 || diag.matchedCount > 0) {
    lines.push(
      `matching: ${diag.matchedCount}/${diag.total || diag.lineCount || "?"} lines` +
        (diag.progressStage ? ` (${diag.progressStage})` : "")
    );
  }
  if (diag.catalogBlocks) {
    lines.push(`catalogBlocks: ${diag.catalogBlocks}`);
  }
  if (diag.shopDbTimeout) lines.push("shopDb: timeout");
  if (diag.shopDbError) lines.push(`shopDbError: ${diag.shopDbError}`);
  if (diag.provider || diag.model) {
    lines.push(`generation: ${diag.provider || "?"} / ${diag.model || "?"}`);
  }
  if (diag.lastError) lines.push(`lastError: ${diag.lastError}`);
  const recent = (diag.notes || []).slice(-5);
  for (const n of recent) {
    lines.push(`note: ${n.message}`);
  }
  return lines.join("\n");
}

/**
 * User-facing abort reason with progress context.
 */
function formatAbortError(error, diag = null) {
  const raw = String(error?.message || error || "Connection error").trim();
  const parts = [raw];
  if (diag?.matchedCount > 0 || diag?.total > 0) {
    parts.push(
      `Matching stopped at ${diag.matchedCount || 0}/${diag.total || diag.lineCount || "?"}.`
    );
  }
  if (diag?.stage) parts.push(`Stage: ${diag.stage}.`);
  if (diag?.provider || diag?.model) {
    parts.push(`Provider: ${diag.provider || "?"} / ${diag.model || "?"}.`);
  }
  if (diag?.requestId) parts.push(`requestId=${diag.requestId}`);
  if (/connection error/i.test(raw)) {
    parts.push(
      "Likely LM Studio / OpenRouter / proxy dropped during or right after ShopDB matching."
    );
  }
  return parts.join(" ");
}

function recordPipelineFailure(diag, error) {
  if (!diag) return;
  const record = {
    ts: new Date().toISOString(),
    type: "pipeline_failure",
    requestId: diag.requestId,
    channel: diag.channel,
    intent: diag.intent,
    stage: diag.stage,
    matchedCount: diag.matchedCount,
    total: diag.total,
    lineCount: diag.lineCount,
    progressStage: diag.progressStage,
    catalogBlocks: diag.catalogBlocks,
    shopDbTimeout: diag.shopDbTimeout,
    shopDbError: diag.shopDbError,
    provider: diag.provider,
    model: diag.model,
    error: String(error?.message || error || "").slice(0, 500),
    notes: (diag.notes || []).slice(-8),
  };
  diag.lastError = record.error;
  try {
    fs.mkdirSync(FAILURES_DIR, { recursive: true });
    fs.appendFile(FAILURES_FILE, `${JSON.stringify(record)}\n`, (err) => {
      if (err) {
        console.error(
          "[PipelineDiagnostics] append failed:",
          err?.message || err
        );
      }
    });
  } catch (e) {
    console.error(
      "[PipelineDiagnostics] record failed:",
      e?.message || e
    );
  }
  console.error(
    `[OfferKP-Pipeline] FAIL ${record.requestId || "?"} ` +
      `${record.stage} match=${record.matchedCount}/${record.total} ` +
      `${record.error}`
  );
  return record;
}

module.exports = {
  createPipelineDiagnostics,
  note,
  updateMatchProgress,
  updateEnrichFlags,
  setGenerationTarget,
  formatDiagnosticsForLlm,
  formatAbortError,
  recordPipelineFailure,
  FAILURES_FILE,
};
