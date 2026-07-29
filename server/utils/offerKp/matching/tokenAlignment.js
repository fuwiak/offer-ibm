"use strict";

/**
 * Weighted token alignment for technical product names.
 * Diameter/length swaps cost much more than coating synonyms.
 */

const { normalizeForMatch } = require("../hardwareQuery");

const COATING_EQUIV = new Set([
  "цинк",
  "оцинк",
  "оцинкованный",
  "оцинк.",
  "zn",
  "zinc",
  "ocynk",
]);

const LOW_COST_PAIRS = [
  ["н/р", "полная"],
  ["п/р", "неполная"],
  ["кл", "класс"],
];

function tokenizeTechnical(text) {
  return normalizeForMatch(text)
    .replace(/[^\p{L}\p{N}./-]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 1);
}

function isDimensionToken(t) {
  return /^m?\d+x\d+$/i.test(t) || /^m\d+$/i.test(t);
}

function isStandardToken(t) {
  return /^(din|gost|iso|гост)\d*$/i.test(t) || /^\d{3,5}$/.test(t);
}

function substitutionCost(a, b) {
  if (a === b) return 0;
  if (COATING_EQUIV.has(a) && COATING_EQUIV.has(b)) return 0.1;
  for (const [x, y] of LOW_COST_PAIRS) {
    if ((a === x && b === y) || (a === y && b === x)) return 0.15;
  }
  if (isDimensionToken(a) && isDimensionToken(b) && a !== b) return 5;
  if (isStandardToken(a) && isStandardToken(b) && a !== b) return 2.5;
  if (a.length <= 2 && b.length <= 2) return 0.5;
  // Mild char-level similarity for soft tokens
  const maxLen = Math.max(a.length, b.length) || 1;
  let same = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) same++;
  }
  const sim = same / maxLen;
  return sim > 0.6 ? 1 - sim : 1.2;
}

/**
 * Needleman–Wunsch-style alignment cost (normalized).
 * Lower is better. Returns similarity in [0,1] as well.
 */
function alignTechnicalNames(queryText, productName) {
  const a = tokenizeTechnical(queryText);
  const b = tokenizeTechnical(productName);
  if (!a.length || !b.length) {
    return { cost: Infinity, similarity: 0, tokensA: a, tokensB: b };
  }

  const n = a.length;
  const m = b.length;
  const gap = 0.8;
  /** @type {number[][]} */
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i * gap;
  for (let j = 0; j <= m; j++) dp[0][j] = j * gap;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = dp[i - 1][j - 1] + substitutionCost(a[i - 1], b[j - 1]);
      const del = dp[i - 1][j] + gap;
      const ins = dp[i][j - 1] + gap;
      dp[i][j] = Math.min(sub, del, ins);
    }
  }

  const cost = dp[n][m];
  const maxCost = Math.max(n, m) * 5;
  const similarity = Math.max(0, 1 - cost / maxCost);
  return { cost, similarity, tokensA: a, tokensB: b };
}

module.exports = {
  tokenizeTechnical,
  alignTechnicalNames,
  substitutionCost,
};
