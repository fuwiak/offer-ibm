#!/usr/bin/env node
"use strict";

const path = require("path");

process.chdir(path.resolve(__dirname, "../server"));
const printResult = console.log.bind(console);
if (!process.argv.includes("--verbose")) {
  console.log = (...args) => {
    const line = String(args[0] || "");
    if (line.includes("[ShopDB]") || line.includes("[NativeEmbedder]")) return;
    printResult(...args);
  };
}
const { loadEnv } = require("../server/config/loadEnv");
loadEnv();

const { query, resetPool } = require("../server/utils/offerKp/db/client");
const {
  getShopDbReadiness,
} = require("../server/utils/offerKp/shopDbReadiness");
const {
  runProductSearchAgent,
} = require("../server/utils/offerKp/productSearchAgent");
const {
  matchInquiryLine,
} = require("../server/utils/offerKp/matchInquiryLines");
const {
  configuredOptPriceCategoryId,
} = require("../server/utils/offerKp/priceResolve");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

function pct(value, total) {
  return total ? Number(((value / total) * 100).toFixed(2)) : 0;
}

async function main() {
  const sampleSize = Math.max(
    100,
    Math.min(300, parseInt(option("--sample", "100"), 10) || 100)
  );
  const seed = String(option("--seed", "offerkp-2026")).slice(0, 64);
  const retrievalLimit = Math.max(
    50,
    Math.min(100, parseInt(option("--retrieval-limit", "100"), 10) || 100)
  );
  const readiness = await getShopDbReadiness({ force: true });
  if (!readiness.ready) {
    const error = new Error(readiness.code || "INDEX_NOT_READY");
    error.readiness = readiness;
    throw error;
  }

  const products = await query(
    `SELECT p.id, p.name
       FROM shop_product p
      WHERE p.status = 1
      ORDER BY CRC32(CONCAT(?, ':', p.id))
      LIMIT ${sampleSize}`,
    [seed]
  );
  let dbAttempts = 0;
  let dbSuccess = 0;
  let recall50 = 0;
  let recall100 = 0;
  let top1 = 0;
  let maxHitsSeen = 0;
  let exactDecisions = 0;
  let invalidExactState = 0;
  let wrongGroundedExact = 0;
  let wrongPricedExact = 0;
  let accepted = 0;
  let autoAccept = 0;
  let autoAcceptCorrect = 0;
  let exactWithoutProductId = 0;
  let exactWithoutSku = 0;
  let exactWithoutPrice = 0;
  let skuPriceContradictsShopDb = 0;
  const acceptedRows = [];
  const allDecisions = [];
  const failures = [];

  for (const expected of products) {
    dbAttempts += 1;
    try {
      const retrieval = await runProductSearchAgent({
        message: expected.name,
        limit: retrievalLimit,
      });
      dbSuccess += 1;
      const hits = retrieval.products || [];
      const expectedId = String(expected.id);
      const rank = hits.findIndex((row) => String(row.id) === expectedId);
      if (hits.length > maxHitsSeen) maxHitsSeen = hits.length;
      if (rank >= 0) {
        recall100 += 1;
        if (rank < 50) recall50 += 1;
      }
      if (rank === 0) top1 += 1;

      const decision = await matchInquiryLine(
        {
          raw: expected.name,
          name: expected.name,
          quantity: 1,
          unit: "шт",
        },
        { requestId: `random-audit:${seed}:${expected.id}` }
      );
      allDecisions.push(decision);
      const pricedMatch = ["exact", "analog"].includes(decision.matchType);
      const autoAccepted =
        pricedMatch &&
        decision.status !== "Требует проверки" &&
        decision.kpStatus !== "Требуется проверка" &&
        !decision.reviewReason &&
        !!decision.productId;

      if (decision.matchType === "exact") {
        exactDecisions += 1;
        if (!decision.productId || decision.retrieverDisagreement) {
          invalidExactState += 1;
          if (!decision.productId) exactWithoutProductId += 1;
        } else if (String(decision.productId) !== expectedId) {
          wrongGroundedExact += 1;
          if (Number(decision.unitPriceNet) > 0) wrongPricedExact += 1;
        }
        if (decision.productId && !decision.article) exactWithoutSku += 1;
        if (
          decision.productId &&
          Number(decision.unitPriceNet || 0) <= 0 &&
          decision.allowPrice !== false
        ) {
          exactWithoutPrice += 1;
        }
      }

      if (pricedMatch && decision.productId) {
        accepted += 1;
        acceptedRows.push(decision);
      }
      if (autoAccepted) {
        autoAccept += 1;
        if (String(decision.productId) === expectedId) autoAcceptCorrect += 1;
      }

      if (rank !== 0 || String(decision.productId || "") !== expectedId) {
        failures.push({
          expectedProductId: expectedId,
          expectedName: expected.name,
          retrievalRank: rank >= 0 ? rank + 1 : null,
          selectedProductId: decision.productId || null,
          selectedSku: decision.article || null,
          matchType: decision.matchType,
          reviewReason: decision.reviewReason || null,
          autoAccepted,
        });
      }
    } catch (error) {
      failures.push({
        expectedProductId: String(expected.id),
        expectedName: expected.name,
        error: error?.message || String(error),
      });
    }
  }

  const selectedIds = [
    ...new Set(
      acceptedRows
        .map((row) => Number(row.productId))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  const liveRows = selectedIds.length
    ? await query(
        `SELECT p.id AS product_id, p.price AS product_price,
                s.sku, s.price AS sku_price
           FROM shop_product p
           JOIN shop_product_skus s ON s.product_id = p.id
          WHERE p.id IN (${selectedIds.map(() => "?").join(",")})`,
        selectedIds
      )
    : [];
  const liveByProduct = new Map();
  for (const row of liveRows) {
    const key = Number(row.product_id);
    if (!liveByProduct.has(key)) liveByProduct.set(key, []);
    liveByProduct.get(key).push(row);
  }
  const optCategoryId = configuredOptPriceCategoryId();
  const optRows =
    optCategoryId && selectedIds.length
      ? await query(
          `SELECT s.product_id, s.sku, op.price AS opt_price
             FROM shop_product_skus s
             JOIN shop_opt_prices op ON op.sku_id = s.id
            WHERE op.user_category_id = ?
              AND s.product_id IN (${selectedIds.map(() => "?").join(",")})`,
          [optCategoryId, ...selectedIds]
        )
      : [];
  const optByProduct = new Map();
  for (const row of optRows) {
    const key = Number(row.product_id);
    if (!optByProduct.has(key)) optByProduct.set(key, []);
    optByProduct.get(key).push(row);
  }
  for (const decision of acceptedRows) {
    if (decision.matchType !== "exact") continue;
    const live = liveByProduct.get(Number(decision.productId)) || [];
    const sku = String(decision.article || "");
    const price = Number(decision.unitPriceNet || 0);
    const source = String(decision.priceSource || "");
    const skuConfirmed = live.some((row) => String(row.sku || "") === sku);
    let priceConfirmed = price <= 0 && !source;
    if (source === "shop_product_skus.price") {
      priceConfirmed = live.some(
        (row) =>
          String(row.sku || "") === sku &&
          Math.abs(Number(row.sku_price) - price) < 0.005
      );
    } else if (source === "shop_product.price") {
      priceConfirmed = live.some(
        (row) => Math.abs(Number(row.product_price) - price) < 0.005
      );
    } else if (source === "shop_opt_prices.price") {
      priceConfirmed = (
        optByProduct.get(Number(decision.productId)) || []
      ).some(
        (row) =>
          String(row.sku || "") === sku &&
          Math.abs(Number(row.opt_price) - price) < 0.005
      );
    }
    if (!skuConfirmed || !priceConfirmed) skuPriceContradictsShopDb += 1;
  }

  const result = {
    generatedAt: new Date().toISOString(),
    seed,
    sampleSize: products.length,
    retrievalLimit,
    readiness,
    metrics: {
      DBQueryAttemptRate: pct(dbAttempts, products.length),
      DBQuerySuccessRate: pct(dbSuccess, dbAttempts),
      RecallAt50: pct(recall50, products.length),
      RecallAt100: pct(recall100, products.length),
      MaxRetrievalHits: maxHitsSeen,
      RetrievalWindowHonored: maxHitsSeen > 50 || retrievalLimit <= 50,
      Top1Accuracy: pct(top1, products.length),
      RerankGivenRecall:
        recall100 > 0 ? pct(Math.min(top1, recall100), recall100) : 0,
      AutoAcceptRate: pct(autoAccept, products.length),
      AutoAcceptPrecision: pct(autoAcceptCorrect, autoAccept),
      AutoAcceptCoverage: pct(autoAccept, products.length),
      InvalidExactState: pct(invalidExactState, Math.max(exactDecisions, 1)),
      WrongGroundedExact: pct(wrongGroundedExact, Math.max(exactDecisions, 1)),
      WrongPricedExact: pct(wrongPricedExact, Math.max(exactDecisions, 1)),
      ExactWithoutProductId: exactWithoutProductId,
      ExactWithoutSku: exactWithoutSku,
      ExactWithoutPrice: exactWithoutPrice,
      SkuPriceContradictsShopDb: skuPriceContradictsShopDb,
      acceptedDecisions: accepted,
      autoAcceptDecisions: autoAccept,
      autoAcceptCorrectDecisions: autoAcceptCorrect,
      exactDecisions,
      invalidExactStateDecisions: invalidExactState,
      wrongGroundedExactDecisions: wrongGroundedExact,
      wrongPricedExactDecisions: wrongPricedExact,
    },
    failures: failures.slice(0, 50),
  };
  printResult(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          error: error?.message || String(error),
          readiness: error?.readiness || null,
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  })
  .finally(() => resetPool());
