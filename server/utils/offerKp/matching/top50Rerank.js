"use strict";

/**
 * Deterministic Top-50 → Top-10 rerank for ShopDB matching.
 *
 * Pipeline (CPU, no LLM):
 *   1. hard parameter filters (diameter / length / standard conflicts)
 *   2. BM25 + size/standard/SKU feature boosts
 *   3. keep Top-10 for identity ranking
 *   4. expose Top-1 vs Top-2 margin for selective accept
 *
 * Does not assign prices — only reorders identity before pickBest / gates.
 */

function envInt(name, fallback, min, max) {
  const n = parseInt(process.env[name], 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function envFloat(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function top10Limit() {
  return envInt("OFFER_KP_RERANK_TOP_K", 10, 3, 25);
}

function minAcceptMargin() {
  return envFloat("OFFER_KP_RERANK_MARGIN", 0.15);
}

function hardConflictCount(alt = {}) {
  return (
    (alt.constraintViolations || []).length ||
    (alt._signatureHard || []).length ||
    0
  );
}

/**
 * Composite identity score. Hard conflicts dominate; BM25 / size / standard
 * decide among technically valid candidates.
 */
function identityRerankScore(alt = {}) {
  const features = alt._features || {};
  const hard = hardConflictCount(alt);
  if (hard > 0) return -1000 * hard;

  const bm25 = Number(alt._bm25Score ?? features.bm25Score ?? 0) || 0;
  const lexical = Number(features.lexicalScore ?? alt._nameSimilarity ?? 0) || 0;
  const embedding =
    Number(features.embeddingScore ?? alt._embeddingSimilarity ?? 0) || 0;
  const alignment = Number(features.alignmentSim ?? 0) || 0;
  const ltr = Number(alt._ltrScore ?? 0) || 0;

  // 0 = known miss (hard), 0.5 = unknown, 1 = match. Known miss must beat BM25 noise.
  const diam = Number(features.diameterMatch);
  const len = Number(features.lengthMatch);
  const std = Number(features.standardMatch);
  const diamTerm = !Number.isFinite(diam) || diam === 0.5 ? 0 : diam === 0 ? -8 : 5;
  const lenTerm = !Number.isFinite(len) || len === 0.5 ? 0 : len === 0 ? -8 : 5;
  const stdTerm = !Number.isFinite(std) || std === 0.5 ? 0 : std === 0 ? -5 : 3.5;

  return (
    bm25 * 1.2 +
    diamTerm +
    lenTerm +
    stdTerm +
    (features.typeMatch || 0) * 2.0 +
    (features.strengthMatch || 0) * 0.6 +
    (features.coatingMatch || 0) * 0.3 +
    lexical * 1.2 +
    embedding * 0.8 +
    alignment * 1.5 +
    ltr * 0.35 -
    (features.softViolationCount || 0) * 0.8 -
    (features.missingParamCount || 0) * 0.4
  );
}

function typeRank(matchType) {
  if (matchType === "exact") return 0;
  if (matchType === "analog") return 1;
  if (matchType === "similar") return 2;
  return 3;
}

/**
 * True when runner-up differs on a hard identity dimension (size/standard/type).
 * Coating / strength twins of the same M×L are not identity rivals.
 */
function isIdentityRival(best, other) {
  if (!best || !other) return false;
  const a = best._features || {};
  const b = other._features || {};
  return (
    (a.diameterMatch || 0) !== (b.diameterMatch || 0) ||
    (a.lengthMatch || 0) !== (b.lengthMatch || 0) ||
    (a.standardMatch || 0) !== (b.standardMatch || 0) ||
    (a.typeMatch || 0) !== (b.typeMatch || 0)
  );
}

/**
 * Reorder Top-50 alternatives: hard filters first, then identity score,
 * promote Top-10 ahead of the rest (full list kept for conformal / UI).
 *
 * @returns {{
 *   alternatives: object[],
 *   top10: object[],
 *   best: object|null,
 *   runnerUp: object|null,
 *   identityRival: object|null,
 *   margin: number,
 *   acceptByMargin: boolean,
 * }}
 */
function rerankTop50(alternatives = []) {
  const scored = (alternatives || []).map((alt, index) => {
    const score = identityRerankScore(alt);
    return {
      ...alt,
      _rerankScore: Number(score.toFixed(6)),
      _rerankIndex: index,
    };
  });

  scored.sort((a, b) => {
    const hardDelta = hardConflictCount(a) - hardConflictCount(b);
    if (hardDelta !== 0) return hardDelta;
    const tr = typeRank(a.matchType) - typeRank(b.matchType);
    if (tr !== 0) return tr;
    return (
      b._rerankScore - a._rerankScore ||
      (b._ltrScore || 0) - (a._ltrScore || 0) ||
      (b._bm25Score || 0) - (a._bm25Score || 0) ||
      Number(a.productId || 0) - Number(b.productId || 0) ||
      a._rerankIndex - b._rerankIndex
    );
  });

  const limit = top10Limit();
  const top10 = scored.slice(0, limit);
  // Promote Top-10 block; preserve relative order of the remainder.
  const rest = scored.slice(limit);
  const ordered = [...top10, ...rest];

  const best = ordered[0] || null;
  const runnerUp =
    ordered.find(
      (row) => best && String(row.productId) !== String(best.productId)
    ) || null;
  const identityRival =
    ordered.find(
      (row) =>
        best &&
        String(row.productId) !== String(best.productId) &&
        isIdentityRival(best, row)
    ) || null;

  const marginPeer = identityRival || runnerUp;
  const margin =
    best && marginPeer
      ? Number(best._rerankScore) - Number(marginPeer._rerankScore)
      : Infinity;
  const threshold = minAcceptMargin();
  const acceptByMargin =
    !best ||
    hardConflictCount(best) > 0 ||
    !Number.isFinite(margin)
      ? false
      : margin >= threshold || !identityRival;

  return {
    alternatives: ordered,
    top10,
    best,
    runnerUp,
    identityRival,
    margin: Number.isFinite(margin) ? Number(margin.toFixed(6)) : margin,
    acceptByMargin,
    marginThreshold: threshold,
  };
}

module.exports = {
  top10Limit,
  minAcceptMargin,
  identityRerankScore,
  isIdentityRival,
  hardConflictCount,
  rerankTop50,
};
