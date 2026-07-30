#!/usr/bin/env node
"use strict";

/**
 * Compare live ShopDB matcher against THIS graphify audit golden pack
 * (not the repo-wide test_files default).
 *
 * Ground truth = Rag_catalog_selfmatch_100.expected.csv in this folder.
 * Golden overrides OFF by default (measures retrieval+rank, not the lookup table).
 *
 * Usage (from repo root):
 *   node graphify-audits/golden-rag-selfmatch-100/compare-vs-golden.cjs
 *   node graphify-audits/golden-rag-selfmatch-100/compare-vs-golden.cjs --limit 20
 *   node graphify-audits/golden-rag-selfmatch-100/compare-vs-golden.cjs --json graphify-audits/golden-rag-selfmatch-100/last-compare.json
 *
 * Graphify query against this pack:
 *   cd graphify-audits/golden-rag-selfmatch-100 && graphify query "golden self-match SKU oracle" --graph graphify-out/graph.json
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const PACK_DIR = __dirname;
const REPO_ROOT = path.resolve(PACK_DIR, "../..");
const DEFAULT_CSV = path.join(
  PACK_DIR,
  "Rag_catalog_selfmatch_100.expected.csv"
);
const DEFAULT_JSON = path.join(PACK_DIR, "last-compare.json");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

function main() {
  if (!fs.existsSync(DEFAULT_CSV)) {
    throw new Error(`GOLDEN_CSV_MISSING: ${DEFAULT_CSV}`);
  }

  const csvRel = path.relative(REPO_ROOT, DEFAULT_CSV);
  const jsonOut = option("--json", DEFAULT_JSON);
  const limit = option("--limit", "");
  const concurrency = option("--concurrency", "4");
  const withOverrides = process.argv.includes("--with-overrides");

  const args = [
    path.join(REPO_ROOT, "scripts/eval-golden-matching.cjs"),
    "--csv",
    csvRel,
    "--concurrency",
    concurrency,
    "--json",
    path.relative(REPO_ROOT, jsonOut),
  ];
  if (limit) args.push("--limit", limit);
  if (withOverrides) args.push("--with-overrides");

  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) throw result.error;
  const failed =
    result.signal != null ||
    (typeof result.status === "number" && result.status !== 0);
  if (failed) {
    const code =
      typeof result.status === "number" && result.status !== 0
        ? result.status
        : 1;
    console.error(
      JSON.stringify({
        error: "COMPARE_CHILD_FAILED",
        status: result.status,
        signal: result.signal || null,
      })
    );
    process.exit(code);
  }

  // Stamp pack-local compare meta next to the report.
  const metaPath = path.join(PACK_DIR, "last-compare.meta.json");
  const reportPath = path.isAbsolute(jsonOut)
    ? jsonOut
    : path.resolve(REPO_ROOT, jsonOut);
  let reportSummary = null;
  try {
    const full = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    reportSummary = {
      total: full.total,
      skuAt1: full.skuAt1,
      wrongSku: full.wrongSku,
      abstained: full.abstained,
      matchTypes: full.matchTypes,
      wallClockSec: full.wallClockSec,
    };
  } catch {
    reportSummary = null;
  }

  const { GOLDEN_META } = require("./goldenSnapshot.cjs");
  fs.writeFileSync(
    metaPath,
    `${JSON.stringify(
      {
        comparedAt: new Date().toISOString(),
        pack: GOLDEN_META.id,
        seed: GOLDEN_META.seed,
        csv: csvRel,
        json: path.relative(REPO_ROOT, reportPath),
        goldenOverrides: withOverrides ? "on" : "off",
        graph: "graphify-out/graph.json",
        summary: reportSummary,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  // Also keep a committed-friendly copy when --json points at compare-report.json
  if (reportSummary && /compare-report\.json$/.test(reportPath)) {
    fs.writeFileSync(
      path.join(PACK_DIR, "compare-report.meta.json"),
      `${JSON.stringify(
        {
          ...reportSummary,
          comparedAt: new Date().toISOString(),
          pack: GOLDEN_META.id,
          seed: GOLDEN_META.seed,
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }
}

main();
