"use strict";

/**
 * Production matching profile: deterministic ShopDB path first.
 * Heuristic LTR/Bayes/conformal layers are optional enrichment only
 * (OFFER_KP_MATCH_ENRICHMENT=0 disables them). Embedding/CE never override
 * exact structured SKU hits. LLM fallback is skip-when-strong-catalog.
 */
const DETERMINISTIC_MATCH_PROFILE = Object.freeze({
  id: "deterministic-prod-v9",
  embedding: "optional_rerank",
  crossEncoder: "disabled_by_default",
  llmRank: "fallback_only",
  ltr: "heuristic_linear",
  bayes: "heuristic_log_evidence",
  conformal: "margin_heuristic",
});

function matchEnrichmentEnabled() {
  return process.env.OFFER_KP_MATCH_ENRICHMENT !== "0";
}

module.exports = {
  DETERMINISTIC_MATCH_PROFILE,
  matchEnrichmentEnabled,
};
