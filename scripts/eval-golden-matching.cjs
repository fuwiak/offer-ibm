#!/usr/bin/env node
"use strict";

/**
 * Run a matching golden set (test_files/*.expected.csv with matched_sku) through
 * the real ShopDB matcher and score SKU@1 against the expected column.
 *
 * Golden overrides are DISABLED by default (SHOP_DB_GOLDEN_CORRECTIONS=0):
 * with them on, every golden row is answered from the lookup table and the
 * score says nothing about retrieval. Use --with-overrides to measure the
 * production path including the override layer.
 *
 * Usage:
 *   node scripts/eval-golden-matching.cjs
 *   node scripts/eval-golden-matching.cjs --csv test_files/Shopdb_random_100.expected.csv
 *   node scripts/eval-golden-matching.cjs --limit 20 --concurrency 4
 *   node scripts/eval-golden-matching.cjs --with-overrides --json out/report.json
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
process.chdir(path.join(REPO_ROOT, "server"));

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

const withOverrides = process.argv.includes("--with-overrides");
if (!withOverrides) process.env.SHOP_DB_GOLDEN_CORRECTIONS = "0";

const { loadEnv } = require("../server/config/loadEnv");
loadEnv();
if (!withOverrides) process.env.SHOP_DB_GOLDEN_CORRECTIONS = "0";

const { resetPool } = require("../server/utils/offerKp/db/client");
const {
  matchInquiryLine,
} = require("../server/utils/offerKp/matchInquiryLines");

/** Minimal CSV reader mirroring goldenCorrections.parseCsvLine. */
function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function readGoldenRows(csvPath) {
  const text = fs.readFileSync(csvPath, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const idx = {
    name: col("source_name"),
    unit: col("unit"),
    quantity: col("quantity"),
    sku: col("matched_sku"),
    matchType: col("match_type"),
  };
  if (idx.name < 0 || idx.sku < 0) {
    throw new Error(`CSV lacks source_name/matched_sku: ${csvPath}`);
  }
  return lines.slice(1).map((line, i) => {
    const f = parseCsvLine(line);
    return {
      nr: i + 1,
      name: String(f[idx.name] || "").trim(),
      unit: idx.unit >= 0 ? String(f[idx.unit] || "шт").trim() : "шт",
      quantity: idx.quantity >= 0 ? Number(f[idx.quantity]) || 1 : 1,
      expectedSku: String(f[idx.sku] || "").trim(),
      expectedMatchType:
        idx.matchType >= 0
          ? String(f[idx.matchType] || "").trim() || "exact"
          : "exact",
    };
  });
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
      }
    })()
  );
  await Promise.all(runners);
  return results;
}

function pct(part, total) {
  return total ? Number(((part / total) * 100).toFixed(1)) : 0;
}

async function main() {
  const csvRel = option("--csv", "test_files/Shopdb_random_100.expected.csv");
  const csvPath = path.resolve(REPO_ROOT, csvRel);
  const limit = parseInt(option("--limit", "0"), 10) || 0;
  const concurrency = Math.max(
    1,
    Math.min(8, parseInt(option("--concurrency", "4"), 10) || 4)
  );
  const jsonOut = option("--json", "");

  const allRows = readGoldenRows(csvPath).filter(
    (row) => row.name && row.expectedSku
  );
  const rows = limit > 0 ? allRows.slice(0, limit) : allRows;
  if (!rows.length) throw new Error("NO_GOLDEN_ROWS");

  const startedAt = Date.now();
  const results = await mapWithConcurrency(rows, concurrency, async (row) => {
    const at = Date.now();
    try {
      const line = await matchInquiryLine({
        name: row.name,
        raw: `${row.name} | ${row.quantity} | ${row.unit}`,
        quantity: row.quantity,
        unit: row.unit,
      });
      return {
        nr: row.nr,
        name: row.name,
        expectedSku: row.expectedSku,
        gotSku: line.article || "",
        matchType: line.matchType,
        reviewReason: line.reviewReason || null,
        price: line.unitPriceNet || 0,
        ms: Date.now() - at,
        skuHit: (line.article || "") === row.expectedSku,
      };
    } catch (error) {
      return {
        nr: row.nr,
        name: row.name,
        expectedSku: row.expectedSku,
        gotSku: "",
        matchType: "error",
        reviewReason: "match_error",
        price: 0,
        ms: Date.now() - at,
        skuHit: false,
        error: error?.message || String(error),
      };
    }
  });

  const total = results.length;
  const hits = results.filter((r) => r.skuHit);
  const wrongSku = results.filter((r) => r.gotSku && !r.skuHit);
  const abstained = results.filter((r) => !r.gotSku);
  const priced = results.filter((r) => r.price > 0);
  const byMatchType = {};
  for (const r of results) {
    byMatchType[r.matchType] = (byMatchType[r.matchType] || 0) + 1;
  }
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);

  const report = {
    csv: csvRel,
    goldenOverrides: withOverrides ? "on" : "off",
    total,
    skuAt1: { count: hits.length, pct: pct(hits.length, total) },
    // Wrong SKU is the only failure mode that can put a false price in a quote.
    wrongSku: { count: wrongSku.length, pct: pct(wrongSku.length, total) },
    abstained: { count: abstained.length, pct: pct(abstained.length, total) },
    pricedLines: { count: priced.length, pct: pct(priced.length, total) },
    matchTypes: byMatchType,
    latencyMs: {
      p50: latencies[Math.floor(latencies.length * 0.5)] || 0,
      p95: latencies[Math.floor(latencies.length * 0.95)] || 0,
      max: latencies[latencies.length - 1] || 0,
    },
    wallClockSec: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    wrongSkuRows: wrongSku.slice(0, 20).map((r) => ({
      nr: r.nr,
      name: r.name,
      expectedSku: r.expectedSku,
      gotSku: r.gotSku,
      matchType: r.matchType,
      price: r.price,
    })),
    abstainedRows: abstained.slice(0, 20).map((r) => ({
      nr: r.nr,
      name: r.name,
      expectedSku: r.expectedSku,
      matchType: r.matchType,
      reviewReason: r.reviewReason,
    })),
  };

  if (jsonOut) {
    const jsonPath = path.resolve(REPO_ROOT, jsonOut);
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(
      jsonPath,
      `${JSON.stringify({ ...report, results }, null, 2)}\n`,
      "utf8"
    );
  }
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({ error: error?.message || String(error) }, null, 2)
    );
    process.exitCode = 1;
  })
  .finally(() => resetPool());
