"use strict";

/**
 * Per-line match evidence / audit trace.
 * Explains every quote line decision; complements searchMetrics JSONL.
 */

const { DETERMINISTIC_MATCH_PROFILE } = require("./matching/algorithmProfile");

/** Bump when match acceptance / price eligibility rules change. */
const MATCH_RULES_VERSION =
  process.env.OFFER_KP_MATCH_RULES_VERSION ||
  `${DETERMINISTIC_MATCH_PROFILE.id}`;

const PRICE_ELIGIBLE_MATCH_TYPES = Object.freeze(["exact", "analog"]);

/**
 * @param {object} line — matched inquiry line
 * @param {{ llmUsed?: boolean, requestId?: string|null }} [extra]
 */
function buildLineEvidence(line = {}, extra = {}) {
  const matchType = String(line.matchType || "none");
  const priceEligible = PRICE_ELIGIBLE_MATCH_TYPES.includes(matchType);
  const shopDbPrice = priceEligible
    ? Number(line.unitPriceNet) > 0
      ? Number(line.unitPriceNet)
      : null
    : null;

  return {
    requested: String(line.requestedName || line.inquiryRaw || line.name || ""),
    selected_product_id: line.productId ? String(line.productId) : null,
    selected_sku: line.article ? String(line.article) : null,
    match_type: matchType,
    match_sources: Array.isArray(line.matchStrategies)
      ? line.matchStrategies.filter(Boolean)
      : line.matchSource
        ? [line.matchSource]
        : [],
    shopdb_price: shopDbPrice,
    shopdb_retrieved_at: line.retrievedAt || null,
    llm_used: Boolean(extra.llmUsed ?? strategiesUsedLlm(line.matchStrategies)),
    rules_version: MATCH_RULES_VERSION,
    allow_price: Boolean(line.allowPrice),
    review_reason: line.reviewReason || null,
    request_id: extra.requestId || null,
  };
}

function strategiesUsedLlm(strategies = []) {
  return (strategies || []).some((s) =>
    /llm|search_agent|agent/i.test(String(s || ""))
  );
}

/**
 * Attach compact `evidence` onto a matched line (immutable-ish copy).
 * @param {object} line
 * @param {{ llmUsed?: boolean, requestId?: string|null }} [extra]
 */
function withLineEvidence(line, extra = {}) {
  if (!line || typeof line !== "object") return line;
  return {
    ...line,
    evidence: buildLineEvidence(line, extra),
  };
}

/**
 * @param {object[]} lines
 * @param {{ requestId?: string|null }} [opts]
 */
function attachDraftEvidence(lines = [], opts = {}) {
  return (lines || []).map((line) =>
    withLineEvidence(line, { requestId: opts.requestId || null })
  );
}

module.exports = {
  MATCH_RULES_VERSION,
  PRICE_ELIGIBLE_MATCH_TYPES,
  buildLineEvidence,
  withLineEvidence,
  attachDraftEvidence,
  strategiesUsedLlm,
};
