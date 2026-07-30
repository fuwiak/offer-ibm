#!/usr/bin/env node
"use strict";

/**
 * Sample N active ShopDB products (deterministic CRC32 seed) and write a
 * matching golden CSV under test_files/:
 *   nr,source_name,unit,quantity,matched_sku,matched_name,match_type
 *
 * Ground truth = catalog self-match (name → first SKU, match_type=exact).
 * Price is never stored — runtime always resolves from ShopDB.
 *
 * Usage:
 *   node scripts/generate-shopdb-golden-sample.cjs
 *   node scripts/generate-shopdb-golden-sample.cjs --sample 100 --seed offerkp-2026
 *   node scripts/generate-shopdb-golden-sample.cjs --out test_files/Shopdb_random_100.expected.csv
 */

const fs = require("fs");
const path = require("path");

process.chdir(path.resolve(__dirname, "../server"));
const { loadEnv } = require("../server/config/loadEnv");
loadEnv();

const { query, resetPool } = require("../server/utils/offerKp/db/client");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const sampleSize = Math.max(
    1,
    Math.min(500, parseInt(option("--sample", "100"), 10) || 100)
  );
  const seed = String(option("--seed", "offerkp-golden-2026")).slice(0, 64);
  const outRel = option(
    "--out",
    `test_files/Shopdb_random_${sampleSize}.expected.csv`
  );
  const outPath = path.resolve(__dirname, "..", outRel);
  // Matching-only by default: do NOT write a sibling .txt — goldenSet.test.js
  // would treat it as an extraction oracle and fail on catalog self-match lines.
  const writeTxt = process.argv.includes("--with-txt");
  const txtPath = outPath.replace(/\.expected\.csv$/, ".txt");

  const rows = await query(
    `SELECT p.id AS product_id,
            p.name AS product_name,
            s.sku AS sku
       FROM shop_product p
       INNER JOIN shop_product_skus s ON s.product_id = p.id
      WHERE p.status = 1
        AND s.sku IS NOT NULL
        AND TRIM(s.sku) <> ''
        AND s.id = (
              SELECT MIN(s2.id)
                FROM shop_product_skus s2
               WHERE s2.product_id = p.id
                 AND s2.sku IS NOT NULL
                 AND TRIM(s2.sku) <> ''
            )
      ORDER BY CRC32(CONCAT(?, ':', p.id))
      LIMIT ${sampleSize}`,
    [seed]
  );

  if (!rows.length) {
    throw new Error("NO_PRODUCTS_SAMPLED");
  }

  const header =
    "nr,source_name,unit,quantity,matched_sku,matched_name,match_type";
  const lines = [header];
  const txtLines = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row.product_name || "").trim();
    const sku = String(row.sku || "").trim();
    if (!name || !sku) continue;
    const nr = lines.length; // 1-based after header
    lines.push(
      [
        nr,
        csvEscape(name),
        "шт",
        1,
        csvEscape(sku),
        csvEscape(name),
        "exact",
      ].join(",")
    );
    txtLines.push(`${nr}. ${name} — 1 шт`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  if (writeTxt) {
    fs.writeFileSync(txtPath, `${txtLines.join("\n")}\n`, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        seed,
        sampleSize: lines.length - 1,
        out: path.relative(path.resolve(__dirname, ".."), outPath),
        txt: writeTxt
          ? path.relative(path.resolve(__dirname, ".."), txtPath)
          : null,
        firstSku: rows[0]?.sku || null,
        lastSku: rows[rows.length - 1]?.sku || null,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({ error: error?.message || String(error) }, null, 2)
    );
    process.exitCode = 1;
  })
  .finally(() => resetPool());
