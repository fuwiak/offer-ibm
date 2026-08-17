"use strict";

/**
 * Lightweight Bayesian / log-evidence score for SKU matching.
 * P(SKU|features) ≈ prior + Σ log evidence — no full Bayes net required.
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

function logEvidenceScore(queryText, product = {}) {
  const parsed = parseHardwareQuery(queryText);
  const nameNorm = normalizeForMatch(product.name || "");
  const thread = extractThread(queryText) || parsed.thread;
  const standards = extractStandardNumbers(queryText);

  // Mild popularity prior (log scale).
  const sales = Math.min(Number(product.total_sales) || 0, 100);
  let score = Math.log1p(sales) * 0.05;

  if ((parsed.productTypes || []).length) {
    const hit = parsed.productTypes.some((type) =>
      (PRODUCT_TYPE_ROOTS[type] || []).some((r) =>
        nameNorm.includes(normalizeForMatch(r))
      )
    );
    score += hit ? 2.2 : -2.5;
  }

  if (thread) {
    if (threadMatchesExact(nameNorm, thread)) score += 3.5;
    else if (
      nameNorm.includes(`m${thread.size}`) ||
      nameNorm.includes(`m ${thread.size}`)
    ) {
      score += 0.4; // diameter only — weak
      score -= 2.0; // length mismatch evidence
    } else {
      score -= 3.0;
    }
  }

  if (standards.length) {
    const productStandards = extractStandardNumbers(product.name || "");
    const hit = standards.some((s) => {
      const equiv = getEquivalentStandards(s);
      return productStandards.some(
        (ps) => equiv.includes(String(ps)) || String(ps) === String(s)
      );
    });
    score += hit ? 2.8 : -1.5;
  }

  if (parsed.coating) {
    score += /оцинк|цинк|\bzn\b/i.test(nameNorm) ? 0.6 : -0.4;
  }
  if (parsed.strengthClass) {
    score += textHasDecimalToken(nameNorm, parsed.strengthClass) ? 0.7 : -0.3;
  }

  return score;
}

module.exports = { logEvidenceScore };
