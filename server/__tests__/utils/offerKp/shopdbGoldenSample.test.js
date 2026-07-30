/* eslint-env jest, node */

/**
 * Structural guard for the generated ShopDB matching sample
 * (scripts/generate-shopdb-golden-sample.cjs). It is the override + few-shot
 * source, so a broken column silently degrades matching instead of failing.
 * Live SKU accuracy is measured separately: scripts/eval-golden-matching.cjs.
 */

const fs = require("fs");
const path = require("path");
const {
  reloadGoldenCorrections,
  findGoldenCorrection,
} = require("../../../utils/offerKp/goldenCorrections");

const CSV_PATH = path.resolve(
  __dirname,
  "../../../../test_files/Shopdb_random_100.expected.csv"
);

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

const describeOrSkip = fs.existsSync(CSV_PATH) ? describe : describe.skip;

describeOrSkip("ShopDB random golden sample", () => {
  const lines = fs.existsSync(CSV_PATH)
    ? fs
        .readFileSync(CSV_PATH, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
    : [];
  const header = lines.length ? parseCsvLine(lines[0]) : [];
  const rows = lines.slice(1).map(parseCsvLine);

  beforeAll(() => {
    reloadGoldenCorrections();
  });

  it("carries the matching columns", () => {
    expect(header).toEqual([
      "nr",
      "source_name",
      "unit",
      "quantity",
      "matched_sku",
      "matched_name",
      "match_type",
    ]);
  });

  it("has 100 usable rows", () => {
    expect(rows.length).toBe(100);
    for (const row of rows) {
      expect(row[1].length).toBeGreaterThan(3); // source_name
      expect(row[4]).toMatch(/^\d{9,20}$/); // matched_sku
      expect(row[6]).toBe("exact"); // match_type
    }
  });

  it("never repeats a SKU", () => {
    const skus = rows.map((row) => row[4]);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it("stores no price column (price always comes from ShopDB)", () => {
    expect(header.join(",")).not.toMatch(/price|цена/i);
  });

  it("feeds every row into the correction lookup", () => {
    const misses = rows.filter((row) => {
      const hit = findGoldenCorrection([row[1]]);
      return !hit || hit.sku !== row[4];
    });
    expect(misses.map((row) => row[1])).toEqual([]);
  });
});
