"use strict";

/**
 * Structured review / abstention reason codes for OfferKP quote lines.
 * Free-text `comment` stays for humans; `reviewReason` is for metrics & UI.
 */

const REVIEW_REASONS = Object.freeze({
  NONE: null,
  SIZE_UNCONFIRMED: "size_unconfirmed",
  SIZE_MISMATCH: "size_mismatch",
  SPEC_MISMATCH: "spec_mismatch",
  NO_MATCH: "no_match",
  UNDERSPECIFIED: "underspecified",
  UNIT_RECALC: "unit_recalc",
  PRICE_MISSING: "price_missing",
  RETRIEVER_DISAGREEMENT: "retriever_disagreement",
  MATCH_ERROR: "match_error",
  GOLDEN_NONE: "golden_none",
  OUT_OF_DISTRIBUTION: "out_of_distribution",
  LOW_CONFIDENCE: "low_confidence",
  HARD_CONSTRAINT: "hard_constraint",
  SELECTIVE_REJECT: "selective_reject",
});

/**
 * @param {{
 *   accepted: boolean,
 *   matchType?: string|null,
 *   mismatchReason?: string|null,
 *   unitNeedsRecalc?: boolean,
 *   hasPrice?: boolean,
 *   retrieverDisagreement?: boolean,
 *   underspecified?: boolean,
 *   goldenNone?: boolean,
 *   matchError?: boolean,
 * }} input
 * @returns {string|null}
 */
function resolveReviewReason(input = {}) {
  if (input.matchError) return REVIEW_REASONS.MATCH_ERROR;
  if (input.goldenNone) return REVIEW_REASONS.GOLDEN_NONE;
  if (input.underspecified) return REVIEW_REASONS.UNDERSPECIFIED;
  if (input.retrieverDisagreement) return REVIEW_REASONS.RETRIEVER_DISAGREEMENT;
  if (input.outOfDistribution) return REVIEW_REASONS.OUT_OF_DISTRIBUTION;
  if (input.hardConstraint) return REVIEW_REASONS.HARD_CONSTRAINT;
  if (input.selectiveReject) {
    if (input.gateReason === "low_ltr_margin" || input.gateReason === "low_bayes") {
      return REVIEW_REASONS.LOW_CONFIDENCE;
    }
    return REVIEW_REASONS.SELECTIVE_REJECT;
  }
  if (input.unitNeedsRecalc) return REVIEW_REASONS.UNIT_RECALC;

  const mismatch = input.mismatchReason || null;
  if (mismatch === "size_unconfirmed") return REVIEW_REASONS.SIZE_UNCONFIRMED;
  if (mismatch === "size_mismatch" || input.matchType === "size_mismatch") {
    return REVIEW_REASONS.SIZE_MISMATCH;
  }
  if (
    mismatch === "product_type" ||
    mismatch === "coating" ||
    mismatch === "strength_class" ||
    input.matchType === "spec_mismatch"
  ) {
    return REVIEW_REASONS.SPEC_MISMATCH;
  }

  if (!input.accepted) {
    if (input.matchType === "size_unconfirmed")
      return REVIEW_REASONS.SIZE_UNCONFIRMED;
    if (input.matchType === "size_mismatch") return REVIEW_REASONS.SIZE_MISMATCH;
    if (input.matchType === "spec_mismatch") return REVIEW_REASONS.SPEC_MISMATCH;
    return REVIEW_REASONS.NO_MATCH;
  }

  if (input.accepted && !input.hasPrice) return REVIEW_REASONS.PRICE_MISSING;
  return REVIEW_REASONS.NONE;
}

module.exports = { REVIEW_REASONS, resolveReviewReason };
