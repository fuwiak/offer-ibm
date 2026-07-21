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

  it("loads all 7 verified matching rows from Prostoy_* CSVs", () => {
    const examples = listMatchExamples();
    expect(examples.length).toBeGreaterThanOrEqual(7);

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
  });

  it.each([
    [
      "Анкерный болт с гайкой 10x 97 M8 оцинк- Арт. 011144100100097",
      "011144100100097",
    ],
    [
      "Винт с цилиндрической головкой и шестигранным углублением под ключ DIN 912 -М8х14-10,9 цинк",
      "009121100080014",
    ],
    [
      "Винт с шестигранным головкой DIN 933 М16х70-10,9-цинк",
      "009331100160070",
    ],
  ])("findGoldenCorrection resolves %s → SKU %s", (sourceName, sku) => {
    const hit = findGoldenCorrection([sourceName]);
    expect(hit).not.toBeNull();
    expect(hit.sku).toBe(sku);
    expect(hit.matchType).toBe("exact");
  });

  it("does not invent a correction for an unknown query", () => {
    expect(
      findGoldenCorrection(["полностью выдуманный товар XYZ-999-нет-в-каталоге"])
    ).toBeNull();
  });
});
