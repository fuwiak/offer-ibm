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
  laineyPostWidenRun: {
    at: "2026-07-30T08:02:22.414Z",
    readyCommit: "108d98c",
    artifact: "graphify-audits/shopdb-metrics-100/audit-100-post-widen.json",
  },
  baselineBeforeOramaAndRerank: {
    RecallAt50: 99,
    Top1Accuracy: 73,
  },
  postRerankBeforeWiden: {
    RecallAt50: 92,
    Top1Accuracy: 91,
    AutoAcceptCoverage: 80,
    AutoAcceptPrecision: 100,
    InvalidExactStateRaw: 7,
  },
  postWidenAudit100: {
    status: "completed",
    RecallAt50: 92,
    RecallAt100: 92,
    Top1Accuracy: 91,
    RerankGivenRecall: 98.91,
    AutoAcceptCoverage: 80,
    AutoAcceptPrecision: 100,
    InvalidExactState: 0,
    WrongGroundedExact: 0,
    WrongPricedExact: 0,
    ExactWithoutProductId: 0,
    ExactWithoutSku: 0,
    ExactWithoutPrice: 0,
    SkuPriceContradictsShopDb: 0,
    exactDecisions: 84,
    note:
      "Contract fixed (InvalidExact 7→0). Recall unchanged: 8 misses absent even at Top-100.",
  },
  productionTargets: {
    AutoAcceptPrecision: "98-99%",
    AutoAcceptCoverage: "75-90%",
    Top1Accuracy: "85%+",
    WrongPricedExact: "0",
    InvalidExactState: "0",
  },
};
