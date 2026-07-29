"use strict";

/**
 * Active learning: prioritize which lines operators should correct.
 * Uncertainty + disagreement + novelty + business value.
 */

function activeLearningScore(lineContext = {}) {
  const {
    best = null,
    runnerUp = null,
    retrieverDisagreement = false,
    outOfDistribution = false,
    underspecified = false,
    matchType = null,
    lineTotal = 0,
    softViolations = 0,
    hardViolations = 0,
    unknownStandard = false,
  } = lineContext;

  let score = 0;
  const reasons = [];

  const margin =
    best &&
    runnerUp &&
    Number.isFinite(best._ltrScore) &&
    Number.isFinite(runnerUp._ltrScore)
      ? best._ltrScore - runnerUp._ltrScore
      : null;

  if (margin !== null && margin < 0.4) {
    score += 3;
    reasons.push("low_margin");
  }
  if (retrieverDisagreement) {
    score += 4;
    reasons.push("retriever_disagreement");
  }
  if (outOfDistribution) {
    score += 2;
    reasons.push("ood");
  }
  if (underspecified) {
    score += 1.5;
    reasons.push("underspecified");
  }
  if (hardViolations > 0) {
    score += 2;
    reasons.push("hard_constraints");
  }
  if (softViolations > 0) {
    score += 0.5;
    reasons.push("soft_constraints");
  }
  if (unknownStandard) {
    score += 2.5;
    reasons.push("unknown_standard");
  }
  if (matchType === "similar" || matchType === "size_mismatch") {
    score += 1.5;
    reasons.push("weak_match_type");
  }
  if (matchType === "none") {
    score += 1;
    reasons.push("no_match");
  }

  // High-value lines: worth labeling first.
  const valueBoost = Math.min(Number(lineTotal) || 0, 50000) / 10000;
  if (valueBoost > 0.5) {
    score += valueBoost;
    reasons.push("high_value");
  }

  return {
    score: Number(score.toFixed(3)),
    reasons,
    shouldLabel: score >= 2.5,
  };
}

/**
 * Sort draft lines by labeling priority (desc).
 */
function prioritizeLinesForLabeling(lines = []) {
  return [...lines]
    .map((line, index) => ({
      index,
      line,
      priority: line.activeLearning || activeLearningScore({
        best: line.alternatives?.[0],
        runnerUp: line.alternatives?.[1],
        retrieverDisagreement: !!line.retrieverDisagreement,
        outOfDistribution: !!line.anomaly?.outOfDistribution,
        underspecified: (line.missingAttributes || []).length > 0,
        matchType: line.matchType,
        lineTotal: line.lineTotal,
      }),
    }))
    .sort((a, b) => b.priority.score - a.priority.score);
}

module.exports = {
  activeLearningScore,
  prioritizeLinesForLabeling,
};
