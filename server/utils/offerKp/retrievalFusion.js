"use strict";

/**
 * Reciprocal Rank Fusion over ranked candidate lists.
 * Dense / lexical / SQL pools stay independent sources — RRF only merges ranks.
 */

function mergeCandidateMeta(previous, next) {
  if (!previous) return next;
  if (!next) return previous;
  return {
    ...previous,
    ...next,
    _canonicalText: previous._canonicalText || next._canonicalText,
    _embeddingSimilarity:
      previous._embeddingSimilarity ?? next._embeddingSimilarity ?? null,
    _denseSimilarity: previous._denseSimilarity ?? next._denseSimilarity ?? null,
    _canonicalSimilarity:
      previous._canonicalSimilarity ?? next._canonicalSimilarity ?? null,
    _rrfScore: Math.max(previous._rrfScore || 0, next._rrfScore || 0),
    _matchSources: [
      ...new Set([
        ...(previous._matchSources || []),
        ...(next._matchSources || []),
      ]),
    ],
    shopMatchSources: [
      ...new Set([
        ...(previous.shopMatchSources || []),
        ...(next.shopMatchSources || []),
      ]),
    ],
  };
}

/**
 * @param {Array<Array<object>>} rankLists - each list ordered best→worst
 * @param {{ k?: number, idKey?: string }} [opts]
 * @returns {Array<object & { _rrfScore: number }>}
 */
function reciprocalRankFusion(rankLists, opts = {}) {
  const k = Math.max(1, Number(opts.k) || 60);
  const idKey = opts.idKey || "id";
  const scores = new Map();

  for (const list of rankLists || []) {
    if (!Array.isArray(list) || !list.length) continue;
    list.forEach((item, rank) => {
      const id = Number(item?.[idKey] ?? item?.productId);
      if (!Number.isFinite(id) || id <= 0) return;
      const contrib = 1 / (k + rank + 1);
      const prev = scores.get(id);
      if (!prev) {
        scores.set(id, {
          id,
          score: contrib,
          item: { ...item, id },
        });
        return;
      }
      prev.score += contrib;
      prev.item = mergeCandidateMeta(prev.item, { ...item, id });
    });
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .map(({ item, score }) => ({
      ...item,
      _rrfScore: Number(score.toFixed(6)),
    }));
}

module.exports = {
  reciprocalRankFusion,
  mergeCandidateMeta,
};
