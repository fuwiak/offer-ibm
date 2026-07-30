"use strict";

/**
 * Heuristic Learning-to-Rank (CPU). Feature weights mimic LambdaMART intent.
 * Export vectors for future LightGBM training on operator corrections.
 *
 * Env: OFFER_KP_LTR_ENABLED=0 to disable re-ranking (features still computed).
 */

const { FEATURE_NAMES, extractMatchFeatures } = require("./matchFeatures");

/** Default weights — cost-sensitive: hard violations dominate. */
const DEFAULT_WEIGHTS = Object.freeze({
  lexicalScore: 1.2,
  embeddingScore: 1.0,
  // BM25F already boosts SKU/size/standard — keep it decisive for Top-50→Top-1.
  bm25Score: 2.2,
  alignmentSim: 1.4,
  typeMatch: 2.0,
  standardMatch: 2.5,
  diameterMatch: 4.0,
  lengthMatch: 4.0,
  coatingMatch: 0.4,
  strengthMatch: 0.5,
  missingParamCount: -0.6,
  popularity: 0,
  isAnalogCandidate: -0.1,
  hardViolationCount: -8.0,
  softViolationCount: -0.8,
  // Price/stock are post-identity signals — never decide which product wins.
  hasPrice: 0,
  inStock: 0,
});

function ltrEnabled() {
  return process.env.OFFER_KP_LTR_ENABLED !== "0";
}

function scoreFeatures(features, weights = DEFAULT_WEIGHTS) {
  let score = 0;
  for (const name of FEATURE_NAMES) {
    score += (Number(features[name]) || 0) * (weights[name] || 0);
  }
  return score;
}

/**
 * Rank alternatives with LTR score. Attaches `_ltrScore` and `_features`.
 */
function rankWithLtr(queryText, alternatives = [], productsById = new Map()) {
  const scored = alternatives.map((alt, index) => {
    const product = productsById.get(String(alt.productId)) || {};
    const extracted = extractMatchFeatures(queryText, alt, product);
    const ltrScore = scoreFeatures(extracted.features);
    return {
      ...alt,
      _ltrScore: ltrScore,
      _features: extracted.features,
      _featureVector: extracted.vector,
      constraintViolations:
        alt.constraintViolations || extracted.constraints.hard,
      softConstraintViolations:
        alt.softConstraintViolations || extracted.constraints.soft,
      constraintPenalty:
        alt.constraintPenalty ?? extracted.constraints.scorePenalty,
      _index: index,
    };
  });

  if (!ltrEnabled()) return scored;

  scored.sort((a, b) => {
    // Preserve matchType priority first (exact > analog > rest).
    const typeRank = (t) =>
      t === "exact" ? 0 : t === "analog" ? 1 : t === "similar" ? 2 : 3;
    const tr = typeRank(a.matchType) - typeRank(b.matchType);
    if (tr !== 0) return tr;
    return (
      b._ltrScore - a._ltrScore ||
      Number(a.id || a.productId || 0) - Number(b.id || b.productId || 0) ||
      a._index - b._index
    );
  });
  return scored;
}

module.exports = {
  DEFAULT_WEIGHTS,
  FEATURE_NAMES,
  ltrEnabled,
  scoreFeatures,
  rankWithLtr,
};
