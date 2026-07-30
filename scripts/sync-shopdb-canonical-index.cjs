#!/usr/bin/env node
"use strict";

const { loadEnv } = require("../server/config/loadEnv");
loadEnv();

const {
  syncCanonicalCatalogIndex,
  PRODUCTS_FILE,
  MANIFEST_FILE,
  VECTORS_FILE,
} = require("../server/utils/offerKp/canonicalCatalogIndex");
const { resetPool } = require("../server/utils/offerKp/db/client");

async function main() {
  const result = await syncCanonicalCatalogIndex({ force: true });
  const manifest = result.manifest || {};
  console.log(
    JSON.stringify(
      {
        success: !result.skipped,
        skipped: result.skipped || false,
        reason: result.reason || null,
        productCount: manifest.productCount || 0,
        hasVectors: !!manifest.hasVectors,
        vectorCount: manifest.vectorCount || 0,
        vectorDims: manifest.vectorDims || 0,
        vectorsEmbedded: manifest.vectorsEmbedded || 0,
        vectorsReused: manifest.vectorsReused || 0,
        embeddingModel: manifest.embeddingModel || null,
        vectorStore: manifest.vectorStore || null,
        vectorDatabaseDir: manifest.vectorDatabaseDir || null,
        historyDatabase: manifest.historyDatabase || null,
        durationMs: manifest.durationMs || 0,
        productsFile: PRODUCTS_FILE,
        manifestFile: MANIFEST_FILE,
        vectorsFile: VECTORS_FILE,
      },
      null,
      2
    )
  );
  resetPool();
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  resetPool();
  process.exit(1);
});
