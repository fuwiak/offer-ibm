#!/usr/bin/env node
"use strict";

/**
 * Renew matching golden CSVs from the ShopDB RAG catalog snapshot
 * (storage/shopdb-index/canonical-products.json).
 *
 * 1. For every test_files .expected.csv with matched_sku: rewrite
 *    matched_name from the live catalog record (SKU authority).
 * 2. Write a committed catalog self-match sample:
 *    test_files/Rag_catalog_selfmatch_100.expected.csv
 *
 * Usage:
 *   node scripts/renew-golden-from-rag.cjs
 *   node scripts/renew-golden-from-rag.cjs --sample 100 --seed offerkp-rag-2026
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const TEST_FILES = path.join(REPO_ROOT, "test_files");
const PRODUCTS_FILE = path.join(
  REPO_ROOT,
  "server/storage/shopdb-index/canonical-products.json"
);

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

function findExpectedCsvFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findExpectedCsvFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".expected.csv")) {
      found.push(full);
    }
  }
  return found;
}

/** CRC32 compatible with MySQL CRC32() for deterministic sampling. */
function crc32(str) {
  let c = 0xffffffff;
  const buf = Buffer.from(String(str), "utf8");
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88350 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function loadCatalogBySku() {
  if (!fs.existsSync(PRODUCTS_FILE)) {
    throw new Error(
      `RAG catalog missing: ${PRODUCTS_FILE}. Sync from Lainey shopdb-index first.`
    );
  }
  const rows = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8"));
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("RAG catalog empty");
  }
  const bySku = new Map();
  for (const row of rows) {
    const name = String(row.name || "").trim();
    const skus = Array.isArray(row.skuCodes) ? row.skuCodes : [];
    for (const sku of skus) {
      const key = String(sku || "").trim();
      if (!key || bySku.has(key)) continue;
      bySku.set(key, { ...row, name, primarySku: key });
    }
  }
  return { rows, bySku };
}

function renewMatchingCsv(csvPath, bySku) {
  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/);
  if (!lines.length) return { updated: 0, missing: [] };
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const skuIdx = header.indexOf("matched_sku");
  const nameIdx = header.indexOf("matched_name");
  const sourceIdx = header.indexOf("source_name");
  if (skuIdx < 0 || nameIdx < 0) {
    return { updated: 0, missing: [], skipped: true };
  }

  let updated = 0;
  const missing = [];
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    const sku = String(fields[skuIdx] || "").trim();
    if (!sku) {
      out.push(line);
      continue;
    }
    const rec = bySku.get(sku);
    if (!rec) {
      missing.push({
        file: path.relative(REPO_ROOT, csvPath),
        sku,
        source: fields[sourceIdx] || "",
      });
      out.push(line);
      continue;
    }
    const prevName = String(fields[nameIdx] || "").trim();
    if (prevName !== rec.name) {
      fields[nameIdx] = rec.name;
      updated += 1;
    }
    out.push(
      fields
        .map((f, idx) => {
          // Preserve quoting for fields that need it.
          if (idx === sourceIdx || idx === nameIdx || idx === skuIdx) {
            return csvEscape(f);
          }
          return /[",\n\r]/.test(String(f)) ? csvEscape(f) : f;
        })
        .join(",")
    );
  }
  if (updated > 0) {
    fs.writeFileSync(csvPath, `${out.join("\n")}\n`, "utf8");
  }
  return { updated, missing, skipped: false };
}

function writeSelfMatchSample(rows, sampleSize, seed, outPath) {
  const ranked = rows
    .map((row) => {
      const sku = String((row.skuCodes || [])[0] || "").trim();
      const name = String(row.name || "").trim();
      const productId = Number(row.productId);
      if (!sku || !name || !Number.isInteger(productId)) return null;
      return {
        productId,
        sku,
        name,
        rank: crc32(`${seed}:${productId}`),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.productId - b.productId)
    .slice(0, sampleSize);

  const header =
    "nr,source_name,unit,quantity,matched_sku,matched_name,match_type";
  const lines = [header];
  for (let i = 0; i < ranked.length; i++) {
    const row = ranked[i];
    lines.push(
      [
        i + 1,
        csvEscape(row.name),
        "шт",
        1,
        csvEscape(row.sku),
        csvEscape(row.name),
        "exact",
      ].join(",")
    );
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  return {
    sampleSize: ranked.length,
    firstSku: ranked[0]?.sku || null,
    lastSku: ranked[ranked.length - 1]?.sku || null,
  };
}

function main() {
  const sampleSize = Math.max(
    1,
    Math.min(500, parseInt(option("--sample", "100"), 10) || 100)
  );
  const seed = String(option("--seed", "offerkp-rag-2026")).slice(0, 64);
  const selfOut = path.resolve(
    REPO_ROOT,
    option("--out", "test_files/Rag_catalog_selfmatch_100.expected.csv")
  );

  const { rows, bySku } = loadCatalogBySku();
  const renewals = [];
  const missingAll = [];
  for (const csvPath of findExpectedCsvFiles(TEST_FILES)) {
    // Do not rewrite the sample we are about to regenerate in the same pass
    // if it already exists — renewMatchingCsv still ok (self-consistent).
    const result = renewMatchingCsv(csvPath, bySku);
    if (result.skipped) continue;
    renewals.push({
      file: path.relative(REPO_ROOT, csvPath),
      updated: result.updated,
      missing: result.missing.length,
    });
    missingAll.push(...result.missing);
  }

  const sample = writeSelfMatchSample(rows, sampleSize, seed, selfOut);

  // Keep local private Shopdb sample aligned with RAG when present.
  const shopdbOut = path.join(TEST_FILES, "Shopdb_random_100.expected.csv");
  let shopdb = null;
  if (fs.existsSync(shopdbOut) || process.argv.includes("--also-shopdb")) {
    shopdb = writeSelfMatchSample(
      rows,
      100,
      "offerkp-golden-2026",
      shopdbOut
    );
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        catalogProducts: rows.length,
        catalogSkus: bySku.size,
        renewals,
        missingSkus: missingAll,
        selfMatch: {
          seed,
          ...sample,
          out: path.relative(REPO_ROOT, selfOut),
        },
        shopdbLocal: shopdb
          ? { ...shopdb, out: path.relative(REPO_ROOT, shopdbOut) }
          : null,
      },
      null,
      2
    )
  );
  if (missingAll.length) process.exitCode = 2;
}

main();
