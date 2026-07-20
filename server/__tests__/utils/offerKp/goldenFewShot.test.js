const {
  retrieveFewShotExamples,
  formatFewShotBlock,
} = require("../../../utils/offerKp/goldenFewShot");

describe("goldenFewShot", () => {
  it("formats an empty example list as an empty string", () => {
    expect(formatFewShotBlock([])).toBe("");
  });

  it("formats examples with product name and analog marker", () => {
    const block = formatFewShotBlock([
      { sourceName: "Болт DIN 933 M8x40", matchedName: "Болт DIN 933 M8x40 оцинк", sku: "1", matchType: "exact" },
      { sourceName: "Гайка М10", matchedName: null, sku: "2", matchType: "analog" },
    ]);
    expect(block).toContain('Запрос: "Болт DIN 933 M8x40"');
    expect(block).toContain("Болт DIN 933 M8x40 оцинк");
    expect(block).toContain("SKU 2");
    expect(block).toContain("(аналог)");
  });

  it("returns no examples when the golden set has none (current test_files state)", async () => {
    const examples = await retrieveFewShotExamples("Болт DIN 933 M8x40");
    expect(examples).toEqual([]);
  });

  it("short-circuits on empty search text without touching the embedder", async () => {
    await expect(retrieveFewShotExamples("")).resolves.toEqual([]);
  });
});
