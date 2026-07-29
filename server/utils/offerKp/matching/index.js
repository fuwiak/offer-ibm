"use strict";

/**
 * Matching enrichment orchestrator:
 * blocking → constraints → LTR → Bayes → (caller picks best) →
 * selective/cost gates → conformal → anomaly → active learning.
 */

const { applyBlocking } = require("./entityBlocking");
const { applyConstraintsToAlternative } = require("./constraintValidator");
const { rankWithLtr } = require("./learningToRank");
const { logEvidenceScore } = require("./bayesianScore");
const { selectivePredict } = require("./selectivePrediction");
const { conformalCandidateSet } = require("./conformalPrediction");
const { detectAnomaly } = require("./anomalyDetection");
const { activeLearningScore } = require("./activeLearning");
const { resolveExpert } = require("./productTypeExperts");
const { aggregateWeakLabels } = require("./weakSupervision");

/**
 * Annotate + re-rank alternatives (constraints, LTR, Bayes, weak labels).
 */
function enrichAlternatives(input = {}) {
  const queryText = input.queryText || "";
  const products = input.products || [];
  const productsById = new Map(products.map((p) => [String(p.id), p]));

  const blocked = applyBlocking(
    queryText,
    (input.alternatives || []).map((a) => ({ ...a, name: a.name }))
  );

  let alternatives = (
    blocked.filtered ? blocked.candidates : input.alternatives || []
  ).map((alt) => applyConstraintsToAlternative(queryText, alt));

  alternatives = rankWithLtr(queryText, alternatives, productsById);
  alternatives = alternatives.map((alt) => {
    const product = productsById.get(String(alt.productId)) || alt;
    const bayes = logEvidenceScore(queryText, product);
    const weak = aggregateWeakLabels({
      features: alt._features,
      strategies: input.matchStrategies || [],
      matchSource: alt.matchSource,
      matchType: alt.matchType,
      hardViolations: (alt.constraintViolations || []).length,
    });
    return {
      ...alt,
      _bayesScore: bayes,
      weakLabel: weak.label,
      weakLabelConfidence: weak.confidence,
    };
  });

  return {
    alternatives,
    blocking: {
      filtered: blocked.filtered,
      kept: blocked.kept,
      keys: blocked.block.keys,
    },
  };
}

/**
 * Gates + conformal + anomaly + active learning after best is chosen.
 */
function decideMatchGates(input = {}) {
  const queryText = input.queryText || "";
  const alternatives = input.alternatives || [];
  const products = input.products || [];
  const best = input.best || null;

  const anomaly = detectAnomaly(queryText, {
    candidates: products,
    embeddingTop: (() => {
      const scores = products
        .map((p) => Number(p._embeddingSimilarity))
        .filter((n) => Number.isFinite(n) && n > 0);
      return scores.length ? Math.max(...scores) : null;
    })(),
  });
  const expert = resolveExpert(queryText);

  const rankedForMargin = [...alternatives].sort(
    (a, b) => (b._ltrScore || 0) - (a._ltrScore || 0)
  );
  const runnerUp =
    rankedForMargin.find((a) => a && best && a.productId !== best.productId) ||
    null;

  const hardOod = (anomaly.reasons || []).some((r) =>
    [
      "repeated_char_spam",
      "high_noise_chars",
      "line_too_short",
      "mixed_script_noise",
    ].includes(r)
  );

  const selective = selectivePredict({
    best,
    runnerUp,
    expertConfig: expert.config,
    retrieverDisagreement: !!input.retrieverDisagreement,
    underspecified: !!input.underspecified,
    // Soft OOD (e.g. missing embeddings) must NOT block ShopDB exact prices.
    outOfDistribution: hardOod,
  });

  const conformal = conformalCandidateSet(rankedForMargin, {
    targetCoverage: 0.95,
    maxSize: 3,
  });

  const activeLearning = activeLearningScore({
    best,
    runnerUp,
    retrieverDisagreement: !!input.retrieverDisagreement,
    outOfDistribution: anomaly.outOfDistribution,
    underspecified: !!input.underspecified,
    matchType: best?.matchType || null,
    lineTotal: Number(input.lineTotal) || 0,
    softViolations: (best?.softConstraintViolations || []).length,
    hardViolations: (best?.constraintViolations || []).length,
    unknownStandard: (anomaly.reasons || []).includes("unknown_standard"),
  });

  let gateRejected = false;
  let gateReason = selective.reason;
  let acceptedMatchType = best?.matchType || "none";

  if (best?.matchType === "exact" && !selective.acceptExact) {
    gateRejected = true;
    acceptedMatchType = "none";
  } else if (best?.matchType === "analog" && !selective.acceptAnalog) {
    gateRejected = true;
    acceptedMatchType = "none";
  }

  if (
    hardOod &&
    (best?.matchType === "exact" || best?.matchType === "analog")
  ) {
    gateRejected = true;
    gateReason = gateReason || "out_of_distribution";
    acceptedMatchType = "none";
  }

  return {
    anomaly,
    expert: { id: expert.expertId },
    selective,
    conformal,
    activeLearning,
    runnerUp,
    gateRejected,
    gateReason,
    acceptedMatchType,
  };
}

/**
 * Full pipeline helper (tests / tooling).
 */
function enrichMatchDecision(input = {}) {
  const enriched = enrichAlternatives(input);
  const best =
    input.best &&
    enriched.alternatives.find(
      (a) => String(a.productId) === String(input.best.productId)
    )
      ? enriched.alternatives.find(
          (a) => String(a.productId) === String(input.best.productId)
        )
      : enriched.alternatives.find((a) => a.matchType === "exact") ||
        enriched.alternatives.find((a) => a.matchType === "analog") ||
        enriched.alternatives[0] ||
        null;
  const gates = decideMatchGates({
    ...input,
    alternatives: enriched.alternatives,
    best,
  });
  return {
    ...enriched,
    best,
    ...gates,
  };
}

module.exports = {
  enrichAlternatives,
  decideMatchGates,
  enrichMatchDecision,
  applyBlocking: require("./entityBlocking").applyBlocking,
  validateCandidate: require("./constraintValidator").validateCandidate,
  rankWithLtr: require("./learningToRank").rankWithLtr,
  selectivePredict: require("./selectivePrediction").selectivePredict,
  conformalCandidateSet: require("./conformalPrediction").conformalCandidateSet,
  detectAnomaly: require("./anomalyDetection").detectAnomaly,
  activeLearningScore: require("./activeLearning").activeLearningScore,
  resolveExpert: require("./productTypeExperts").resolveExpert,
  aggregateWeakLabels: require("./weakSupervision").aggregateWeakLabels,
  getAllowedAnalogs: require("./standardGraph").getAllowedAnalogs,
  alignTechnicalNames: require("./tokenAlignment").alignTechnicalNames,
  logEvidenceScore: require("./bayesianScore").logEvidenceScore,
  costSensitiveDecision: require("./costSensitive").costSensitiveDecision,
};
