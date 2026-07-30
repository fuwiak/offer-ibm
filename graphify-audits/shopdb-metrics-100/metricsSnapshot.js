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
    AutoAcceptRate: 80,
    AutoAcceptPrecision: 100,
    AutoAcceptCoverage: 80,
    FalseExactRateRaw: 7.69,
    UnconfirmedSkuOrPriceRateRaw: 7.69,
    note:
      "Raw FalseExact includes 7 exact+empty-productId retriever_disagreement abstentions; auto-accept precision is 100%.",
    autoAcceptDecisions: 80,
    autoAcceptCorrectDecisions: 80,
    exactDecisions: 91,
    falseExactDecisionsRaw: 7,
  },
  newMetricsSchema: {
    AutoAcceptRate: "autoAccept / queries",
    AutoAcceptPrecision: "correctAutoAccept / autoAccept",
    AutoAcceptCoverage: "autoAccept / queries",
    Top1Accuracy: "retrievalRank===1 / queries",
    FalseExactRate: "wrongExact / exactDecisions",
    UnconfirmedSkuOrPriceRate: "ungroundedSkuOrPrice / accepted",
  },
  productionTargets: {
    AutoAcceptPrecision: "98-99%",
    AutoAcceptCoverage: "75-90%",
    Top1Accuracy: "85%+",
    FalseExactRate: "<1%",
    SkuPriceGrounding: "100%",
  },
  pipeline: [
    "top50_retrieval_rrf",
    "hard_param_filters",
    "bm25f_sku_size_standard_boosts",
    "ltr_identity_top10_rerank",
    "margin_vs_identity_rival",
    "accept_or_needs_review",
  ],
  scripts: [
    "scripts/audit-shopdb-random-sample.cjs",
    "scripts/report-shopdb-metrics.cjs",
  ],
  modules: [
    "server/utils/offerKp/matching/top50Rerank.js",
    "server/utils/offerKp/shopDbBm25Index.js",
  ],
};
