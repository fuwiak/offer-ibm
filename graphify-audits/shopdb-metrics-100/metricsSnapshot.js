"use strict";

/**
 * ShopDB random-100 audit snapshot for graphify (code-only extract).
 * Full narrative: AUDYT_SHOPDB_METRICS_100.md
 */

module.exports = {
  generatedAt: "2026-07-30",
  seed: "offerkp-2026",
  sampleSize: 100,
  rerankCommit: "954d1bd",
  retrievalWidenCommit: "fa2ea6d",
  laineyRun: {
    at: "2026-07-30T07:40:52.092Z",
    host: "87.228.90.43",
    app: "/opt/offer-kp/app",
    readyCommit: "890afca",
    index: { products: 19764, bm25: 19764, vectors: 19764 },
    artifact: "/opt/offer-kp/data/audit-100-offerkp-2026.json",
  },
  baselineBeforeOramaAndRerank: {
    DBQueryAttemptRate: 100,
    DBQuerySuccessRate: 100,
    RecallAt50: 99,
    Top1Accuracy: 73,
    FalseExactRate: 0,
    UnconfirmedSkuOrPriceRate: 0,
  },
  postRerankAudit100: {
    status: "completed",
    DBQueryAttemptRate: 100,
    DBQuerySuccessRate: 100,
    RecallAt50: 92,
    Top1Accuracy: 91,
    RerankGivenRecall: 98.9,
    AutoAcceptRate: 80,
    AutoAcceptPrecision: 100,
    AutoAcceptCoverage: 80,
    InvalidExactStateRaw: 7,
    WrongGroundedExact: 0,
    WrongPricedExact: 0,
    note:
      "fa2ea6d widens retrieval to Top-100 and demotes ungrounded exact; re-run audit after deploy.",
  },
  productionTargets: {
    AutoAcceptPrecision: "98-99%",
    AutoAcceptCoverage: "75-90%",
    Top1Accuracy: "85%+",
    WrongPricedExact: "0",
    SkuPriceGrounding: "100%",
  },
  pipeline: [
    "sql_structured",
    "orama_bm25_top80",
    "lancedb_dense_top80",
    "rrf_union_top100",
    "hard_param_filters",
    "ltr_identity_top10_rerank",
    "margin_vs_identity_rival",
    "enforce_exact_grounding_contract",
    "accept_or_needs_review",
  ],
};
