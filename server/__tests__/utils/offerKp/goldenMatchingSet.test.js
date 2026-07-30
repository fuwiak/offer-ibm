"use strict";

/**
 * End-to-end check that matching columns in test_files/*.expected.csv
 * actually feed goldenCorrections (override + few-shot source).
 *
 * Extraction goldenSet.test.js only validates name/unit/qty — without this
 * suite a filled matched_sku column can silently stop loading and CI stays green.
 */

const {
  reloadGoldenCorrections,
  findGoldenCorrection,
  listMatchExamples,
  isGoldenCorrectionsEnabled,
} = require("../../../utils/offerKp/goldenCorrections");

describe("golden matching set (test_files matched_sku columns)", () => {
  beforeAll(() => {
    reloadGoldenCorrections();
  });

  it("corrections are enabled by default", () => {
    expect(isGoldenCorrectionsEnabled()).toBe(true);
  });

  it("loads verified matching rows including Shopdb_random_100", () => {
    const examples = listMatchExamples();
    // Prostoy (7) + Yandex (1) + Shopdb_random_100 (100) + inquiry_ISO7380 (5) ≥ 113
    expect(examples.length).toBeGreaterThanOrEqual(113);

    const skus = new Set(examples.map((e) => e.sku));
    // Prostoy_zapros_s_nashimi_artikulami_1
    expect(skus.has("011144100100097")).toBe(true);
    expect(skus.has("011144100120130")).toBe(true);
    expect(skus.has("011144100080100")).toBe(true);
    // Prostoy_zapros_2_1
    expect(skus.has("009121100080014")).toBe(true);
    expect(skus.has("009128100080016")).toBe(true);
    expect(skus.has("009331100160070")).toBe(true);
    expect(skus.has("009331100160040")).toBe(true);
    // Yandex site:purolat.com ISO 7380-1 M10x25 10.9
    expect(skus.has("073801000100025")).toBe(true);
    // inquiry_ISO7380_kp_draft_live_price (8.8 → 10.9 analog + M6 sizes)
    expect(skus.has("073801000080070")).toBe(true);
    expect(skus.has("073801000080025")).toBe(true);
    expect(skus.has("073801000060012")).toBe(true);
    expect(skus.has("073801000060020")).toBe(true);
    // Shopdb_random_100 (seed offerkp-golden-2026)
    expect(skus.has("106428102160150")).toBe(true);
    expect(skus.has("004710001150000")).toBe(true);
  });

  it.each([
    [
      "Анкерный болт с гайкой 10x 97 M8 оцинк- Арт. 011144100100097",
      "011144100100097",
      "exact",
    ],
    [
      "Винт с цилиндрической головкой и шестигранным углублением под ключ DIN 912 -М8х14-10,9 цинк",
      "009121100080014",
      "exact",
    ],
    [
      "Винт с шестигранным головкой DIN 933 М16х70-10,9-цинк",
      "009331100160070",
      "exact",
    ],
    [
      "Винт ГОСТ ISO 7380-1-М10х25-8.8",
      "073801000100025",
      "analog",
    ],
    [
      "Винт М6-6gх12 DIN 7380-1 (45104992510700)",
      "073801000060012",
      "analog",
    ],
  ])(
    "findGoldenCorrection resolves %s → SKU %s (%s)",
    (sourceName, sku, matchType) => {
      const hit = findGoldenCorrection([sourceName]);
      expect(hit).not.toBeNull();
      expect(hit.sku).toBe(sku);
      expect(hit.matchType).toBe(matchType);
    }
  );

  it("does not invent a correction for an unknown query", () => {
    expect(
      findGoldenCorrection([
        "полностью выдуманный товар XYZ-999-нет-в-каталоге",
      ])
    ).toBeNull();
  });
});
