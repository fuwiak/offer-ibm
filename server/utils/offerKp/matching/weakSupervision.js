"use strict";

/**
 * Weak supervision: aggregate noisy labeling rules into a soft label.
 * Useful for bootstrapping LTR training without full manual labels.
 */

const LABEL_RULES = [
  {
    id: "exact_sku_strategy",
    weight: 1.0,
    apply: (ctx) =>
      (ctx.strategies || []).includes("exact_sku") ? "exact" : null,
  },
  {
    id: "golden_override",
    weight: 1.5,
    apply: (ctx) =>
      ctx.matchSource === "golden_override" ? ctx.matchType || "exact" : null,
  },
  {
    id: "standard_and_size",
    weight: 0.8,
    apply: (ctx) => {
      const f = ctx.features || {};
      if (f.standardMatch === 1 && f.diameterMatch === 1 && f.lengthMatch === 1) {
        return f.isAnalogCandidate ? "analog" : "exact";
      }
      return null;
    },
  },
  {
    id: "length_mismatch",
    weight: 1.0,
    apply: (ctx) => {
      const f = ctx.features || {};
      if (f.diameterMatch === 1 && f.lengthMatch === 0 && f.diameterMatch !== f.lengthMatch) {
        return "size_mismatch";
      }
      return null;
    },
  },
  {
    id: "hard_constraint",
    weight: 1.2,
    apply: (ctx) =>
      (ctx.hardViolations || 0) > 0 ? "none" : null,
  },
  {
    id: "operator_selected",
    weight: 1.4,
    apply: (ctx) => (ctx.operatorSelected ? "exact" : null),
  },
];

/**
 * @returns {{ label: string|null, confidence: number, votes: object[] }}
 */
function aggregateWeakLabels(ctx = {}) {
  const votes = [];
  for (const rule of LABEL_RULES) {
    const label = rule.apply(ctx);
    if (label) votes.push({ ruleId: rule.id, label, weight: rule.weight });
  }
  if (!votes.length) {
    return { label: null, confidence: 0, votes: [] };
  }

  /** @type {Map<string, number>} */
  const scores = new Map();
  let total = 0;
  for (const v of votes) {
    scores.set(v.label, (scores.get(v.label) || 0) + v.weight);
    total += v.weight;
  }
  let bestLabel = null;
  let bestScore = -1;
  for (const [label, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }
  return {
    label: bestLabel,
    confidence: total > 0 ? bestScore / total : 0,
    votes,
  };
}

module.exports = {
  LABEL_RULES,
  aggregateWeakLabels,
};
