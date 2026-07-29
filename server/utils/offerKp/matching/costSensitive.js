"use strict";

/**
 * Cost-sensitive decision costs for match types.
 * Wrong exact with a foreign price is catastrophically expensive.
 */

const MATCH_COSTS = Object.freeze({
  correct_exact: 0,
  similar_instead_of_exact: 1,
  none_instead_of_exact: 2,
  wrong_analog: 5,
  wrong_exact_with_price: 100,
});

/** Thresholds for auto-accepting exact (tunable via env). */
function exactAcceptThresholds() {
  return {
    minLtrMargin: Number(process.env.OFFER_KP_EXACT_LTR_MARGIN || 0.35),
    minBayesian: Number(process.env.OFFER_KP_EXACT_BAYES_MIN || 2.0),
    maxHardViolations: 0,
    maxSoftViolations: Number(process.env.OFFER_KP_EXACT_MAX_SOFT || 2),
  };
}

/**
 * Expected cost of auto-accepting `best` given runner-up uncertainty.
 */
function estimateAcceptCost(best, runnerUp = null) {
  if (!best) return MATCH_COSTS.none_instead_of_exact;
  if ((best.constraintViolations || []).length) {
    return MATCH_COSTS.wrong_exact_with_price;
  }
  if (best.matchType === "exact" && Number(best.price) > 0) {
    const margin =
      runnerUp && Number.isFinite(best._ltrScore) && Number.isFinite(runnerUp._ltrScore)
        ? best._ltrScore - runnerUp._ltrScore
        : Infinity;
    if (margin < 0.2) return MATCH_COSTS.wrong_exact_with_price * 0.5;
    return MATCH_COSTS.correct_exact;
  }
  if (best.matchType === "analog") {
    const margin =
      runnerUp && Number.isFinite(best._ltrScore) && Number.isFinite(runnerUp._ltrScore)
        ? best._ltrScore - runnerUp._ltrScore
        : Infinity;
    return margin < 0.15 ? MATCH_COSTS.wrong_analog : MATCH_COSTS.similar_instead_of_exact;
  }
  return MATCH_COSTS.similar_instead_of_exact;
}

/**
 * @returns {{ allowExact: boolean, allowAnalog: boolean, reason: string|null, expectedCost: number }}
 */
function costSensitiveDecision(best, runnerUp = null, expertConfig = null) {
  const thresholds = exactAcceptThresholds();
  const expectedCost = estimateAcceptCost(best, runnerUp);
  const strict = process.env.OFFER_KP_SELECTIVE_STRICT === "1";

  if (!best) {
    return {
      allowExact: false,
      allowAnalog: false,
      reason: "no_candidate",
      expectedCost,
    };
  }

  const hard = (best.constraintViolations || []).length;
  const soft = (best.softConstraintViolations || []).length;
  if (hard > thresholds.maxHardViolations) {
    return {
      allowExact: false,
      allowAnalog: false,
      reason: "hard_constraint",
      expectedCost,
    };
  }

  const margin =
    runnerUp && Number.isFinite(best._ltrScore) && Number.isFinite(runnerUp._ltrScore)
      ? best._ltrScore - runnerUp._ltrScore
      : Infinity;

  const expertMargin = expertConfig?.exactMarginMin ?? thresholds.minLtrMargin;
  const bayes = Number(best._bayesScore);
  const bayesOk = !Number.isFinite(bayes) || bayes >= thresholds.minBayesian;

  // Structural conflict: runner-up beats best on critical dimension features.
  const structuralRival = Boolean(
    runnerUp &&
      best._features &&
      runnerUp._features &&
      ((runnerUp._features.diameterMatch || 0) >
        (best._features.diameterMatch || 0) ||
        (runnerUp._features.lengthMatch || 0) >
          (best._features.lengthMatch || 0))
  );

  if (best.matchType === "exact") {
    if (soft > thresholds.maxSoftViolations) {
      return {
        allowExact: false,
        allowAnalog: true,
        reason: "soft_constraint_budget",
        expectedCost,
      };
    }
    // Default: only revoke exact when a structural rival exists or STRICT mode.
    if (structuralRival && margin < expertMargin) {
      return {
        allowExact: false,
        allowAnalog: true,
        reason: "low_ltr_margin",
        expectedCost,
      };
    }
    if (strict && margin < expertMargin) {
      return {
        allowExact: false,
        allowAnalog: true,
        reason: "low_ltr_margin",
        expectedCost,
      };
    }
    if (strict && !bayesOk) {
      return {
        allowExact: false,
        allowAnalog: true,
        reason: "low_bayes",
        expectedCost,
      };
    }
    if (expectedCost >= MATCH_COSTS.wrong_exact_with_price) {
      return {
        allowExact: false,
        allowAnalog: false,
        reason: "high_expected_cost",
        expectedCost,
      };
    }
    return { allowExact: true, allowAnalog: true, reason: null, expectedCost };
  }

  if (best.matchType === "analog") {
    if (expertConfig && expertConfig.allowAnalog === false) {
      return {
        allowExact: false,
        allowAnalog: false,
        reason: "expert_disallow_analog",
        expectedCost,
      };
    }
    if (structuralRival && margin < expertMargin * 0.7) {
      return {
        allowExact: false,
        allowAnalog: false,
        reason: "low_analog_margin",
        expectedCost,
      };
    }
    if (strict && margin < expertMargin * 0.7) {
      return {
        allowExact: false,
        allowAnalog: false,
        reason: "low_analog_margin",
        expectedCost,
      };
    }
    return {
      allowExact: false,
      allowAnalog: true,
      reason: null,
      expectedCost,
    };
  }

  return {
    allowExact: false,
    allowAnalog: false,
    reason: "non_priced_match_type",
    expectedCost,
  };
}

module.exports = {
  MATCH_COSTS,
  exactAcceptThresholds,
  estimateAcceptCost,
  costSensitiveDecision,
};
