"use strict";

/**
 * Conformal-style candidate sets (heuristic calibration).
 * When confident → singleton; when uncertain → 2–3 candidates for operator.
 *
 * Full split-conformal needs a labeled calibration set; until then we use
 * margin heuristics that preserve a targetCoverage contract in the API.
 */

function conformalCandidateSet(rankedAlternatives = [], options = {}) {
  const targetCoverage = Number(options.targetCoverage ?? 0.95);
  const maxSize = Math.max(1, Number(options.maxSize ?? 3));
  const usable = (rankedAlternatives || []).filter(
    (a) =>
      a &&
      a.matchType !== "none" &&
      !(a.constraintViolations || []).length
  );

  if (!usable.length) {
    return {
      candidates: [],
      skus: [],
      targetCoverage,
      singleton: false,
      reason: "empty",
    };
  }

  const top = usable[0];
  const second = usable[1] || null;
  const margin =
    second && Number.isFinite(top._ltrScore) && Number.isFinite(second._ltrScore)
      ? top._ltrScore - second._ltrScore
      : Infinity;

  // High margin + exact → singleton set.
  if (
    top.matchType === "exact" &&
    (margin >= 0.8 || !second) &&
    !(top.softConstraintViolations || []).length
  ) {
    return {
      candidates: [summarize(top)],
      skus: [top.sku].filter(Boolean),
      targetCoverage,
      singleton: true,
      reason: "high_confidence",
    };
  }

  const set = [];
  for (const alt of usable) {
    if (set.length >= maxSize) break;
    // Include near-tied candidates or different match types worth reviewing.
    if (
      set.length === 0 ||
      !Number.isFinite(top._ltrScore) ||
      !Number.isFinite(alt._ltrScore) ||
      top._ltrScore - alt._ltrScore < 1.2 ||
      alt.matchType === "exact" ||
      alt.matchType === "analog"
    ) {
      set.push(summarize(alt));
    }
  }

  if (!set.length) set.push(summarize(top));

  return {
    candidates: set,
    skus: set.map((c) => c.sku).filter(Boolean),
    targetCoverage,
    singleton: set.length === 1,
    reason: set.length === 1 ? "single_viable" : "uncertain_set",
  };
}

function summarize(alt) {
  return {
    productId: alt.productId,
    sku: alt.sku || "",
    name: alt.name,
    matchType: alt.matchType,
    price: Number(alt.price) || 0,
    ltrScore: Number.isFinite(alt._ltrScore) ? alt._ltrScore : null,
  };
}

module.exports = { conformalCandidateSet };
