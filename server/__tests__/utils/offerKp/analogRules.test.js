const {
  classifyProductMatch,
  threadMatchesExact,
  STATUS,
  getEquivalentStandards,
  applyMatchPriorityBonus,
} = require("../../../utils/offerKp/analogRules");
const { parseHardwareQuery } = require("../../../utils/offerKp/hardwareQuery");

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

  test("non-piece unit → exact match + Требует проверки (не сбрасывает размер)", () => {
    const result = classifyProductMatch("Болт DIN 933 M8x40 — 5 кг", {
      name: "Болт DIN 933 M8x40",
      stockCount: 100,
    });
    expect(result.matchType).toBe("exact");
    expect(result.status).toBe(STATUS.NEEDS_REVIEW);
  });

  test("kg RFQ does not match wrong thread length", () => {
    const result = classifyProductMatch("Болт ГОСТ 7805-70 M10x100 — 30 кг", {
      name: "Болт ГОСТ 7805-70 M6x25",
      stockCount: 100,
    });
    expect(result.matchType).not.toBe("exact");
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

  test("GOST 7798 query prefers DIN 931 over DIN 933 in scoring", () => {
    const parsed = parseHardwareQuery("Болт ГОСТ 7798 M10x100 8.8");
    const bolt931 = { name: "Болт DIN 931 M10x100 8.8 оцинк" };
    const bolt933 = { name: "Болт DIN 933 M10x100 8.8 оцинк" };
    const score931 = applyMatchPriorityBonus(
      "Болт ГОСТ 7798 M10x100 8.8",
      parsed,
      bolt931,
      100
    );
    const score933 = applyMatchPriorityBonus(
      "Болт ГОСТ 7798 M10x100 8.8",
      parsed,
      bolt933,
      100
    );
    expect(score931).toBeGreaterThan(score933);
  });

  test("GOST 11738 → DIN 912 analog", () => {
    const result = classifyProductMatch("Винт ГОСТ 11738 M10x50 8.8 оц", {
      name: "Винт DIN 912 M10x50 8.8 оцинк Н/Р",
      stockCount: 15,
    });
    expect(result.matchType).toBe("analog");
    expect(result.status).toBe(STATUS.ANALOG);
  });
});
