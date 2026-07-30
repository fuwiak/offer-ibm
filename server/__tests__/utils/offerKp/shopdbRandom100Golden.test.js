"use strict";

/**
 * Shopdb_random_100.expected.csv — 100 catalog self-match rows
 * (seed offerkp-golden-2026). Verifies goldenCorrections load + lookup.
 * Live ShopDB SKU@1: scripts/eval-golden-matching.cjs
 */

const fs = require("fs");
const path = require("path");
const {
  reloadGoldenCorrections,
  findGoldenCorrection,
  listMatchExamples,
  parseExpectedCsv,
} = require("../../../utils/offerKp/goldenCorrections");

const CSV = path.resolve(
  __dirname,
  "../../../../test_files/Shopdb_random_100.expected.csv"
);

describe("Shopdb_random_100 matching golden set", () => {
  beforeAll(() => {
    reloadGoldenCorrections();
  });

  it("CSV has 100 exact rows with matched_sku", () => {
    expect(fs.existsSync(CSV)).toBe(true);
    const rows = parseExpectedCsv(CSV);
    expect(rows.length).toBe(100);
    expect(rows.every((r) => r.sku && r.matchType === "exact")).toBe(true);
    expect(rows.every((r) => r.sourceName && r.matchedName)).toBe(true);
  });

  it("goldenCorrections loads all 100 Shopdb_random SKUs", () => {
    const examples = listMatchExamples();
    const csvSkus = new Set(parseExpectedCsv(CSV).map((r) => r.sku));
    const loaded = examples.filter((e) => csvSkus.has(e.sku));
    expect(loaded.length).toBe(100);
    expect(
      examples.filter((e) =>
        String(e.sourceFile || "").includes("Shopdb_random_100")
      ).length
    ).toBe(100);
  });

  it("findGoldenCorrection resolves every Shopdb_random row by source_name", () => {
    const rows = parseExpectedCsv(CSV);
    let hits = 0;
    const misses = [];
    for (const row of rows) {
      const hit = findGoldenCorrection([row.sourceName]);
      if (hit && hit.sku === row.sku && hit.matchType === "exact") {
        hits += 1;
      } else {
        misses.push({
          name: row.sourceName.slice(0, 60),
          expected: row.sku,
          got: hit?.sku || null,
        });
      }
    }
    expect(misses).toEqual([]);
    expect(hits).toBe(100);
  });

  it.each([
    [
      "Винт DIN 7991 M 16x150  8.8 оцинк П/Р / ISO 10642  (10)",
      "106428102160150",
    ],
    ["Кольцо DIN  471 d115", "004710001150000"],
  ])("spot-check %s → %s", (name, sku) => {
    const hit = findGoldenCorrection([name]);
    expect(hit).not.toBeNull();
    expect(hit.sku).toBe(sku);
  });
});
