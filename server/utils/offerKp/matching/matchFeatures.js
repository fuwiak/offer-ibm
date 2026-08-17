"use strict";

/**
 * Ranking feature vector for Learning-to-Rank (LightGBM/LambdaMART-ready).
 * Values are numeric; training can later replace heuristic weights.
 */

const {
  parseHardwareQuery,
  normalizeForMatch,
  textHasDecimalToken,
  PRODUCT_TYPE_ROOTS,
} = require("../hardwareQuery");
const {
  extractThread,
  extractStandardNumbers,
  threadMatchesExact,
  getEquivalentStandards,
} = require("../analogRules");
const { alignTechnicalNames } = require("./tokenAlignment");
const { validateCandidate } = require("./constraintValidator");

const FEATURE_NAMES = Object.freeze([
  "lexicalScore",
  "embeddingScore",
  "bm25Score",
  "alignmentSim",
  "typeMatch",
  "standardMatch",
  "diameterMatch",
  "lengthMatch",
  "coatingMatch",
  "strengthMatch",
  "missingParamCount",
  "popularity",
  "isAnalogCandidate",
  "hardViolationCount",
  "softViolationCount",
  "hasPrice",
  "inStock",
]);

function bool01(v) {
  return v ? 1 : 0;
}

/**
 * @param {string} queryText
 * @param {object} alt - alternative / product row
 * @param {object} [product] - raw product with _nameSimilarity etc.
 */
function extractMatchFeatures(queryText, alt = {}, product = {}) {
  const parsed = parseHardwareQuery(queryText);
  const nameNorm = normalizeForMatch(alt.name || product.name || "");
  const thread = extractThread(queryText) || parsed.thread;
  const standards = extractStandardNumbers(queryText);
  const productStandards = extractStandardNumbers(alt.name || "");
  const constraints = validateCandidate(queryText, alt);
  const alignment = alignTechnicalNames(queryText, alt.name || "");

  let typeMatch = 0;
  if ((parsed.productTypes || []).length) {
    typeMatch = parsed.productTypes.some((type) =>
      (PRODUCT_TYPE_ROOTS[type] || []).some((r) => nameNorm.includes(normalizeForMatch(r)))
    )
      ? 1
      : 0;
  } else {
    typeMatch = 0.5;
  }

  let standardMatch = 0.5;
  if (standards.length) {
    standardMatch = standards.some((s) => {
      const equiv = getEquivalentStandards(s);
      return productStandards.some((ps) => equiv.includes(String(ps)) || String(ps) === String(s));
    })
      ? 1
      : 0;
  }

  let diameterMatch = 0.5;
  let lengthMatch = 0.5;
  if (thread) {
    const exact = threadMatchesExact(nameNorm, thread);
    diameterMatch = exact || nameNorm.includes(`m${thread.size}`) || nameNorm.includes(`m ${thread.size}`)
      ? 1
      : 0;
    lengthMatch = exact ? 1 : 0;
  }

  let coatingMatch = 0.5;
  if (parsed.coating) {
    coatingMatch = /оцинк|цинк|\bzn\b|zinc/i.test(nameNorm) ? 1 : 0;
  }

  let strengthMatch = 0.5;
  if (parsed.strengthClass) {
    strengthMatch = textHasDecimalToken(nameNorm, parsed.strengthClass)
      ? 1
      : 0;
  }

  const missingParamCount =
    (!thread ? 1 : 0) +
    (!standards.length ? 1 : 0) +
    (!(parsed.productTypes || []).length ? 1 : 0);

  const features = {
    lexicalScore: Number(product._nameSimilarity ?? alt.lexicalScore ?? 0) || 0,
    embeddingScore:
      Number(product._embeddingSimilarity ?? alt.embeddingScore ?? 0) || 0,
    bm25Score: Number(product._bm25Score ?? alt._bm25Score ?? alt.bm25Score ?? 0) || 0,
    alignmentSim: alignment.similarity || 0,
    typeMatch,
    standardMatch,
    diameterMatch,
    lengthMatch,
    coatingMatch,
    strengthMatch,
    missingParamCount,
    popularity: Math.min(Number(product.total_sales || alt.popularity || 0), 50) / 50,
    isAnalogCandidate: bool01(
      alt.matchType === "analog" || Boolean(alt.analogOf)
    ),
    hardViolationCount: constraints.hard.length,
    softViolationCount: constraints.soft.length,
    hasPrice: bool01(Number(alt.price) > 0),
    inStock: bool01(Number(alt.stockCount) > 0),
  };

  return {
    features,
    vector: FEATURE_NAMES.map((k) => features[k]),
    featureNames: FEATURE_NAMES,
    alignment,
    constraints,
  };
}

module.exports = {
  FEATURE_NAMES,
  extractMatchFeatures,
};
