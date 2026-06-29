"use strict";

/**
 * Builds a structured RAG trace object that is saved alongside every chat
 * response.  Provides a full audit trail of what made it into the LLM context.
 *
 * @param {Object} opts
 * @param {string[]}  opts.pinnedDocIdentifiers - source identifiers of pinned docs
 * @param {object[]}  opts.vectorSearchSources  - results from vector similarity search
 * @param {object}    opts.filledSources        - backfilled sources from history window
 * @param {object[]}  opts.parsedFiles          - context files from parsed attachments
 * @param {object[]}  opts.externalContexts     - garant / yandex / google enrichment
 * @param {object}    opts.postProcessLog       - which post-processing steps ran
 * @returns {object}
 */
function buildRagTrace({
  pinnedDocIdentifiers = [],
  vectorSearchSources = [],
  filledSources = {},
  parsedFiles = [],
  externalContexts = [],
  postProcessLog = {},
} = {}) {
  return {
    pinnedCount: pinnedDocIdentifiers.length,
    vectorHits: vectorSearchSources.length,
    backfilledHits: Math.max(
      0,
      (filledSources?.sources?.length || 0) - (vectorSearchSources?.length || 0)
    ),
    parsedFilesCount: parsedFiles.length,
    external: externalContexts.map((ctx) => ({
      kind: ctx.kind || "external",
      contexts: Array.isArray(ctx.contextTexts) ? ctx.contextTexts.length : 0,
      sources: Array.isArray(ctx.sources) ? ctx.sources.length : 0,
      flags: ctx.flags || {},
    })),
    postProcessLog,
  };
}

/**
 * Returns a human-readable summary of the RAG trace for logging.
 * @param {ReturnType<buildRagTrace>} trace
 * @returns {string}
 */
function summarizeRagTrace(trace) {
  if (!trace) return "no trace";
  const ext = (trace.external || [])
    .map((e) => `${e.kind}(${e.contexts}ctx/${e.sources}src)`)
    .join(", ");
  return (
    `pinned=${trace.pinnedCount} vectorHits=${trace.vectorHits} ` +
    `backfilled=${trace.backfilledHits} parsedFiles=${trace.parsedFilesCount}` +
    (ext ? ` external=[${ext}]` : "")
  );
}

module.exports = { buildRagTrace, summarizeRagTrace };
