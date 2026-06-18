const {
  classifyProductMatch,
  threadMatchesExact,
  STATUS,
  getEquivalentStandards,
} = require("../../../utils/offerKp/analogRules");

describe("analogRules", () => {
  test("DIN 931 exact match with stock → В наличии", () => {
    const result = classifyProductMatch("Болт DIN 931 M8x40 оцинк 8.8", {
      name: "Болт шестигранный DIN 931 M8x40 оцинкованный 8.8",
      stockCount: 100,
    });
    expect(result.matchType).toBe("exact");
    expect(result.status).toBe(STATUS.IN_STOCK);
  });

  test("M8x40 requested, M8x45 in stock → Под заказ (no analog)", () => {
    const result = classifyProductMatch("Болт DIN 931 M8x40", {
      name: "Болт DIN 931 M8x45 оцинк",
      stockCount: 50,
    });
    expect(result.status).toBe(STATUS.ON_ORDER);
    expect(result.matchType).not.toBe("analog");
  });

  test("DIN 931 → GOST 7798 analog with exact M×L", () => {
    const result = classifyProductMatch("Болт DIN 931 M10x50 8.8", {
      name: "Болт шестигранный ГОСТ 7798-70 M10x50 класс 8.8",
      stockCount: 20,
    });
    expect(result.matchType).toBe("analog");
    expect(result.status).toBe(STATUS.ANALOG);
    expect(result.analogOf).toMatch(/7798/);
  });

  test("DIN 6325 pin — exact d×l required", () => {
    const result = classifyProductMatch("Штифт DIN 6325 6x20", {
      name: "Штифт цилиндрический ГОСТ 24296-93 6x20",
      stockCount: 10,
    });
    expect(result.matchType).toBe("analog");
    expect(result.status).toBe(STATUS.ANALOG);
  });

  test("pin size mismatch → not analog", () => {
    const result = classifyProductMatch("Штифт DIN 6325 6x20", {
      name: "Штифт ГОСТ 24296-93 6x25",
      stockCount: 10,
    });
    expect(result.matchType).toBe("none");
  });

  test("non-piece unit → Требует проверки", () => {
    const result = classifyProductMatch("Болт DIN 933 M8x40 — 5 кг", {
      name: "Болт DIN 933 M8x40",
      stockCount: 100,
    });
    expect(result.status).toBe(STATUS.NEEDS_REVIEW);
  });

  test("getEquivalentStandards for DIN 934", () => {
    const equiv = getEquivalentStandards("934");
    expect(equiv).toContain("934");
    expect(equiv).toContain("5915");
    expect(equiv).toContain("4032");
  });

  test("threadMatchesExact", () => {
    expect(threadMatchesExact("bolt m8x40 zinc", { size: "8", length: "40" })).toBe(true);
    expect(threadMatchesExact("bolt m8x45 zinc", { size: "8", length: "40" })).toBe(false);
  });
});
