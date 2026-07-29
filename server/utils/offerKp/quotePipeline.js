"use strict";

/**
 * Quote pipeline orchestrator — explicit stages, not a free-form agent.
 *
 * UPLOAD → OCR(optional) → PARSE → VALIDATE_INPUT → SEARCH_SHOPDB/MATCH
 * → VERIFY_PRICES → BUILD_QUOTE → VERIFY_OUTPUT → EXPORT
 *
 * Each stage has clear input/output; guards block export on failure.
 */

const {
  createRequestTrace,
  markStage,
  runTracedStage,
  setTraceIntent,
  appendMatchEvidence,
  setGate,
  finalizeTrace,
  summarizeTrace,
} = require("./requestTrace");
const {
  extractInquiryLines,
  matchInquiryToDraft,
  assertExportGuards,
  stripIllegalPrices,
  attachDraftEvidence,
  verifyQuote,
} = require("./quoteTools");
const { buildLineEvidence } = require("./matchEvidence");
const { assessInquiryCompleteness } = require("./inquiryCompleteness");

/** @type {readonly string[]} */
const QUOTE_PIPELINE_STAGES = Object.freeze([
  "UPLOAD",
  "OCR",
  "PARSE",
  "VALIDATE_INPUT",
  "SEARCH_SHOPDB",
  "MATCH",
  "VERIFY_PRICES",
  "BUILD_QUOTE",
  "VERIFY_OUTPUT",
  "EXPORT",
]);

/**
 * @param {{
 *   inquiryText?: string,
 *   parsedFileTexts?: string[],
 *   ocrText?: string|null,
 *   workspace?: object,
 *   chatHistory?: object,
 *   threadId?: string|null,
 *   intent?: object|null,
 *   channel?: string,
 *   requestId?: string,
 *   onProgress?: Function,
 *   skipExport?: boolean,
 *   markdownPreview?: string|null,
 * }} input
 */
async function runQuotePipeline(input = {}) {
  const trace = createRequestTrace({
    channel: input.channel || "workspace",
    requestId: input.requestId,
  });
  setTraceIntent(trace, input.intent || null);

  const sourceTexts = [
    ...(input.parsedFileTexts || []).filter(Boolean),
    input.ocrText,
    input.inquiryText,
  ].filter(Boolean);
  const inquirySource = sourceTexts.join("\n\n");

  markStage(trace, "UPLOAD", inquirySource ? "ok" : "fail", {
    chars: inquirySource.length,
  });
  if (!inquirySource.trim()) {
    finalizeTrace(trace, { status: "empty_input" });
    return { ok: false, draft: null, sourceLines: [], trace, summary: summarizeTrace(trace) };
  }

  if (input.ocrText) markStage(trace, "OCR", "ok");
  else markStage(trace, "OCR", "skip");

  const sourceLines = await runTracedStage(trace, "PARSE", () =>
    extractInquiryLines(inquirySource)
  );
  trace.quote.sourceLineCount = sourceLines.length;

  if (!sourceLines.length) {
    markStage(trace, "VALIDATE_INPUT", "fail", { reason: "NO_INQUIRY_LINES" });
    finalizeTrace(trace, { status: "no_lines" });
    return {
      ok: false,
      draft: null,
      sourceLines,
      trace,
      summary: summarizeTrace(trace),
    };
  }

  await runTracedStage(trace, "VALIDATE_INPUT", () => {
    const incomplete = sourceLines.filter(
      (l) => !assessInquiryCompleteness(l).ok
    ).length;
    return { lineCount: sourceLines.length, incomplete };
  });

  markStage(trace, "SEARCH_SHOPDB", "start");
  const draft = await runTracedStage(trace, "MATCH", () =>
    matchInquiryToDraft(inquirySource, {
      workspace: input.workspace,
      chatHistory: input.chatHistory,
      parsedFileTexts: input.parsedFileTexts || null,
      threadId: input.threadId || null,
      requestId: trace.requestId,
      onProgress: input.onProgress,
    })
  );
  markStage(trace, "SEARCH_SHOPDB", "ok", {
    matched: draft?.lines?.length || 0,
  });

  // N-in = N-out invariant: pad/replace happens in autoQuoteArtifacts;
  // orchestrator records gate status.
  let lines = attachDraftEvidence(draft?.lines || [], {
    requestId: trace.requestId,
  });
  appendMatchEvidence(
    trace,
    lines.map((l) => buildLineEvidence(l, { requestId: trace.requestId }))
  );

  const priceCheck = await runTracedStage(trace, "VERIFY_PRICES", () => {
    const before = lines;
    const cleaned = stripIllegalPrices(before);
    const stripped = cleaned.filter(
      (l, i) =>
        Number(before[i]?.unitPriceNet) > 0 && Number(l.unitPriceNet) === 0
    ).length;
    lines = cleaned;
    return { stripped };
  });
  setGate(trace, "priceEligibility", "passed");
  if (priceCheck?.stripped) {
    markStage(trace, "VERIFY_PRICES", "ok", { stripped: priceCheck.stripped });
  }

  const built = await runTracedStage(trace, "BUILD_QUOTE", () => {
    const subtotal = lines.reduce(
      (sum, l) => sum + (Number(l.lineTotal) || 0),
      0
    );
    return {
      ...draft,
      lines,
      subtotal: Number(subtotal.toFixed(2)),
      total: Number(subtotal.toFixed(2)),
      requestId: trace.requestId,
      evidence: lines.map((l) => l.evidence).filter(Boolean),
    };
  });

  const exportGate = await runTracedStage(trace, "VERIFY_OUTPUT", () =>
    assertExportGuards({
      sourceLines,
      quoteLines: built.lines,
      draft: built,
      requireSnapshot: false,
    })
  );
  setGate(trace, "exportGuards", exportGate.ok ? "passed" : "failed");

  if (input.markdownPreview) {
    const v = verifyQuote(input.markdownPreview, {
      draft: built,
      sourceLines,
    });
    setGate(trace, "commercialClaims", v.ok ? "passed" : "failed");
  }

  if (!exportGate.ok) {
    finalizeTrace(trace, {
      status: "guard_failed",
      violations: exportGate.violations,
    });
    return {
      ok: false,
      draft: built,
      sourceLines,
      violations: exportGate.violations,
      trace,
      summary: summarizeTrace(trace),
    };
  }

  if (input.skipExport) {
    markStage(trace, "EXPORT", "skip");
  } else {
    markStage(trace, "EXPORT", "ok");
  }

  finalizeTrace(trace, { status: "ok" });
  return {
    ok: true,
    draft: built,
    sourceLines,
    trace,
    summary: summarizeTrace(trace),
  };
}

module.exports = {
  QUOTE_PIPELINE_STAGES,
  runQuotePipeline,
};
