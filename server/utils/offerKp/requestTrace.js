"use strict";

/**
 * Single request-scoped audit trace for OfferKP chat / quote pipelines.
 * One requestId → intent → stages → match evidence → gates → result.
 */

const { randomUUID } = require("crypto");
const { MATCH_RULES_VERSION } = require("./matchEvidence");

/**
 * @typedef {{
 *   requestId: string,
 *   startedAt: string,
 *   channel: string,
 *   intent: object|null,
 *   stages: Array<{ name: string, status: string, at: string, ms?: number, meta?: object }>,
 *   latencyMs: Record<string, number>,
 *   matchEvidence: object[],
 *   quote: object,
 *   gates: Record<string, string>,
 *   generation: object,
 *   result: object|null,
 *   rulesVersion: string,
 * }} OfferKpRequestTrace
 */

/**
 * @param {{ channel?: string, requestId?: string }} [opts]
 * @returns {OfferKpRequestTrace}
 */
function createRequestTrace(opts = {}) {
  return {
    requestId: opts.requestId || randomUUID(),
    startedAt: new Date().toISOString(),
    channel: opts.channel || "workspace",
    intent: null,
    stages: [],
    latencyMs: {},
    matchEvidence: [],
    quote: {
      sourceLineCount: 0,
      draftLineCount: 0,
      priceSnapshotId: null,
      compliance: [],
    },
    gates: {},
    generation: {
      mode: null,
      model: null,
      temperature: null,
    },
    result: null,
    rulesVersion: MATCH_RULES_VERSION,
  };
}

/**
 * @param {OfferKpRequestTrace} trace
 * @param {string} name
 * @param {"ok"|"skip"|"fail"|"start"} [status]
 * @param {object} [meta]
 */
function markStage(trace, name, status = "ok", meta = undefined) {
  if (!trace) return;
  const at = new Date().toISOString();
  const entry = { name, status, at };
  if (meta && typeof meta === "object") entry.meta = meta;
  if (typeof meta?.ms === "number") {
    entry.ms = meta.ms;
    trace.latencyMs[name] = meta.ms;
  }
  trace.stages.push(entry);
}

/**
 * @param {OfferKpRequestTrace} trace
 * @param {() => Promise<T>|T} fn
 * @param {string} name
 * @template T
 */
async function runTracedStage(trace, name, fn) {
  const t0 = Date.now();
  markStage(trace, name, "start");
  try {
    const result = await fn();
    markStage(trace, name, "ok", { ms: Date.now() - t0 });
    return result;
  } catch (err) {
    markStage(trace, name, "fail", {
      ms: Date.now() - t0,
      error: err?.message || String(err),
    });
    throw err;
  }
}

/**
 * @param {OfferKpRequestTrace} trace
 * @param {object|null} intent
 */
function setTraceIntent(trace, intent) {
  if (!trace) return;
  trace.intent = intent
    ? {
        primaryIntent: intent.primaryIntent || intent.intent || null,
        confidence: intent.confidence ?? null,
        source: intent.source || intent.resolvedBy || null,
        policy: intent.policy || null,
      }
    : null;
}

/**
 * @param {OfferKpRequestTrace} trace
 * @param {object[]} evidenceLines
 */
function appendMatchEvidence(trace, evidenceLines = []) {
  if (!trace) return;
  for (const ev of evidenceLines || []) {
    if (!ev) continue;
    trace.matchEvidence.push({
      ...ev,
      request_id: ev.request_id || trace.requestId,
    });
  }
  trace.quote.draftLineCount = trace.matchEvidence.length;
}

/**
 * @param {OfferKpRequestTrace} trace
 * @param {string} gate
 * @param {"passed"|"failed"|"not_applicable"|"skipped"} status
 */
function setGate(trace, gate, status) {
  if (!trace) return;
  trace.gates[gate] = status;
}

/**
 * @param {OfferKpRequestTrace} trace
 * @param {object} result
 */
function finalizeTrace(trace, result = {}) {
  if (!trace) return null;
  trace.result = {
    status: result.status || "ok",
    responseHash: result.responseHash || null,
    ...result,
  };
  return summarizeTrace(trace);
}

/**
 * Compact summary safe for chat metrics / logs (no PII dump of full lines).
 * @param {OfferKpRequestTrace} trace
 */
function summarizeTrace(trace) {
  if (!trace) return null;
  return {
    requestId: trace.requestId,
    channel: trace.channel,
    intent: trace.intent?.primaryIntent || null,
    stages: trace.stages.map((s) => `${s.name}:${s.status}`),
    latencyMs: { ...trace.latencyMs },
    matchCount: trace.matchEvidence.length,
    pricedCount: trace.matchEvidence.filter((e) => e.shopdb_price != null)
      .length,
    llmMatchCount: trace.matchEvidence.filter((e) => e.llm_used).length,
    gates: { ...trace.gates },
    rulesVersion: trace.rulesVersion,
    result: trace.result?.status || null,
  };
}

module.exports = {
  createRequestTrace,
  markStage,
  runTracedStage,
  setTraceIntent,
  appendMatchEvidence,
  setGate,
  finalizeTrace,
  summarizeTrace,
};
