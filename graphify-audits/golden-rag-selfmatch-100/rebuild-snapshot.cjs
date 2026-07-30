#!/usr/bin/env node
"use strict";

/**
 * Rebuild goldenSnapshot.cjs from the pack CSV (for graphify AST extract).
 * Called by scripts/renew-golden-from-rag.cjs after syncing the CSV.
 */

const fs = require("fs");
const path = require("path");

const PACK_DIR = __dirname;
const CSV = path.join(PACK_DIR, "Rag_catalog_selfmatch_100.expected.csv");
const OUT = path.join(PACK_DIR, "goldenSnapshot.cjs");

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

function main() {
  const text = fs.readFileSync(CSV, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (n) => header.indexOf(n);
  const rows = lines.slice(1).map((line, i) => {
    const f = parseCsvLine(line);
    return {
      nr: i + 1,
      sourceName: String(f[col("source_name")] || "").trim(),
      unit: String(f[col("unit")] || "шт").trim(),
      quantity: Number(f[col("quantity")]) || 1,
      matchedSku: String(f[col("matched_sku")] || "").trim(),
      matchedName: String(f[col("matched_name")] || "").trim(),
      matchType: String(f[col("match_type")] || "exact").trim() || "exact",
    };
  });

  const body = `/**
 * Golden RAG catalog self-match oracle for isolated graphify audits.
 * Source CSV: Rag_catalog_selfmatch_100.expected.csv
 * Seed: offerkp-rag-2026 · Renew: scripts/renew-golden-from-rag.cjs
 * Compare: node graphify-audits/golden-rag-selfmatch-100/compare-vs-golden.cjs
 */
"use strict";

const path = require("path");

const GOLDEN_META = Object.freeze({
  id: "golden-rag-selfmatch-100",
  seed: "offerkp-rag-2026",
  sampleSize: ${rows.length},
  sourceCsv: "Rag_catalog_selfmatch_100.expected.csv",
  catalogSource: "server/storage/shopdb-index/canonical-products.json",
  matchType: "exact",
  purpose: "catalog_self_match_oracle",
  compareScript: "compare-vs-golden.cjs",
  renewScript: "scripts/renew-golden-from-rag.cjs",
});

/** @type {ReadonlyArray<{nr:number,sourceName:string,unit:string,quantity:number,matchedSku:string,matchedName:string,matchType:string}>} */
const GOLDEN_ROWS = Object.freeze(${JSON.stringify(rows, null, 2)});

function goldenCsvPath() {
  return path.join(__dirname, GOLDEN_META.sourceCsv);
}

function findBySku(sku) {
  const key = String(sku || "").trim();
  return GOLDEN_ROWS.find((row) => row.matchedSku === key) || null;
}

function findBySourceName(name) {
  const key = String(name || "").trim();
  return GOLDEN_ROWS.find((row) => row.sourceName === key) || null;
}

function skuSet() {
  return new Set(GOLDEN_ROWS.map((row) => row.matchedSku));
}

module.exports = {
  GOLDEN_META,
  GOLDEN_ROWS,
  goldenCsvPath,
  findBySku,
  findBySourceName,
  skuSet,
};
`;

  fs.writeFileSync(OUT, body, "utf8");
  console.log(
    JSON.stringify(
      {
        rows: rows.length,
        out: path.relative(path.resolve(PACK_DIR, "../.."), OUT),
      },
      null,
      2
    )
  );
}

main();
