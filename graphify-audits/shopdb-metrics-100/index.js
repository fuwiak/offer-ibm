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
const {
  rerankTop50,
  isIdentityRival,
  minAcceptMargin,
} = require("./top50Rerank");

/**
 * Annotate + re-rank alternatives (constraints, LTR, Bayes, weak labels).
 * Final order: Top-50 hard filters → BM25/LTR boosts → Top-10 identity rank.
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
  ).map((alt) => {
    const product = productsById.get(String(alt.productId)) || {};
    return applyConstraintsToAlternative(queryText, {
      ...alt,
      // Carry retrieval signals into feature extraction / Top-50 rerank.
      _bm25Score: alt._bm25Score ?? product._bm25Score ?? null,
      _nameSimilarity: alt._nameSimilarity ?? product._nameSimilarity ?? null,
      _embeddingSimilarity:
        alt._embeddingSimilarity ?? product._embeddingSimilarity ?? null,
      _rrfScore: alt._rrfScore ?? product._rrfScore ?? null,
      _signatureHard: alt._signatureHard ?? product._signatureHard ?? [],
    });
  });

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

  const rerank = rerankTop50(alternatives);
  alternatives = rerank.alternatives;

  return {
    alternatives,
    blocking: {
      filtered: blocked.filtered,
      kept: blocked.kept,
      keys: blocked.block.keys,
    },
    rerank: {
      top10Count: rerank.top10.length,
      margin: rerank.margin,
      marginThreshold: rerank.marginThreshold,
      acceptByMargin: rerank.acceptByMargin,
      identityRivalId: rerank.identityRival?.productId || null,
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
    (a, b) =>
      (b._rerankScore || 0) - (a._rerankScore || 0) ||
      (b._ltrScore || 0) - (a._ltrScore || 0)
  );
  const runnerUp =
    rankedForMargin.find((a) => a && best && a.productId !== best.productId) ||
    null;
  const identityRival =
    rankedForMargin.find(
      (a) => a && best && a.productId !== best.productId && isIdentityRival(best, a)
    ) || null;

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
    runnerUp: identityRival || runnerUp,
    expertConfig: expert.config,
    retrieverDisagreement: !!input.retrieverDisagreement,
    underspecified: !!input.underspecified,
    // Soft OOD (e.g. missing embeddings) must NOT block ShopDB exact prices.
    outOfDistribution: hardOod,
    identityRival,
  });

  const conformal = conformalCandidateSet(rankedForMargin, {
    targetCoverage: 0.95,
    maxSize: 3,
  });

  const activeLearning = activeLearningScore({
    best,
    runnerUp: identityRival || runnerUp,
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

  // Explicit Top-1 vs identity-rival margin gate (even when LTR scores missing).
  if (
    !gateRejected &&
    (best?.matchType === "exact" || best?.matchType === "analog") &&
    identityRival &&
    Number.isFinite(best._rerankScore) &&
    Number.isFinite(identityRival._rerankScore)
  ) {
    const rerankMargin = best._rerankScore - identityRival._rerankScore;
    if (rerankMargin < minAcceptMargin()) {
      gateRejected = true;
      gateReason = gateReason || "low_rerank_margin";
      acceptedMatchType = "none";
    }
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
    identityRival,
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
  rerankTop50: require("./top50Rerank").rerankTop50,
};
