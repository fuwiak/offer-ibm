"use strict";

const {
  buildCanonicalProductFields,
  buildCanonicalProductText,
  canonicalEmbeddingCacheKey,
  extractStandards,
} = require("../../../utils/offerKp/canonicalProductText");

describe("canonicalProductText", () => {
  const product = {
    id: 19543,
    name: "Болт DIN 933 M 10x 60 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70 (50)",
    category_name: "DIN 933 / ГОСТ 7798-70",
  };
  const features = [
    { name: "Диаметр", value: "10", unit: "mm" },
    { name: "Длина", value: "60", unit: "mm" },
    { name: "Кл. пр. / Характеристика", value: "10.9" },
    { name: "DIN/ГОСТ/ISO", value: "933" },
    { name: "Материал", value: "Сталь (Steel)" },
    { name: "Ед. изм.", value: "шт" },
    { name: "Кол-во в упаковке", value: "50" },
  ];

  it("builds structured fields from real ShopDB feature names", () => {
    expect(buildCanonicalProductFields(product, features)).toMatchObject({
      type: "болт",
      standards: ["DIN 933", "ГОСТ 7798-70", "ГОСТ 7805-70"],
      diameter: "M10",
      length: "60 mm",
      thread: "полная",
      strength: "10.9",
      coating: "цинк",
      material: "сталь",
      unit: "шт",
      packageQuantity: "50",
    });
  });

  it("serializes a stable labeled canonical text", () => {
    const text = buildCanonicalProductText(product, features);
    expect(text).toContain("тип=болт");
    expect(text).toContain("стандарт=DIN 933, ГОСТ 7798-70");
    expect(text).toContain("диаметр=M10");
    expect(text).toContain("длина=60 mm");
    expect(text).toContain("резьба=полная");
    expect(text).toContain("материал=сталь");
  });

  it("uses model + product + text hash as the embedding cache key", () => {
    const first = canonicalEmbeddingCacheKey("e5", 10, "тип=болт");
    const second = canonicalEmbeddingCacheKey("e5", 10, "тип=гайка");
    expect(first).toMatch(/^e5:10:[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });

  it("preserves multiple standards and their years", () => {
    expect(extractStandards("DIN 931 / ГОСТ 7798-70 / ISO 4014")).toEqual([
      "DIN 931",
      "ГОСТ 7798-70",
      "ISO 4014",
    ]);
  });

  it("does not hard-reject ГОСТ 52644 vs ГОСТ Р 52644-2006", () => {
    const {
      buildQuerySignature,
      buildProductSignature,
      signatureHardConflicts,
      standardFamilyNumber,
    } = require("../../../utils/offerKp/canonicalProductText");
    expect(standardFamilyNumber("ГОСТ Р 52644-2006")).toBe("52644");
    expect(standardFamilyNumber("ГОСТ 52644")).toBe("52644");
    const hard = signatureHardConflicts(
      buildQuerySignature("Болт М20x80 10.9 ХЛ (ГОСТ 52644)"),
      buildProductSignature({
        name: "Болт ГОСТ Р 52644-2006 M 20x 80 10.9 ХЛ  (10)",
      })
    );
    expect(hard).not.toContain("standardFamily");
  });

  it("omits zero placeholder dimensions from ShopDB", () => {
    const text = buildCanonicalProductText({ name: "Гайка DIN 934 M12" }, [
      { name: "Длина", value: "0", unit: "m" },
    ]);
    expect(text).not.toContain("длина=");
  });

  it("omits zero diameter placeholders from ShopDB", () => {
    const text = buildCanonicalProductText({ name: 'Пробка DIN 906 R 3/4"' }, [
      { name: "Диаметр", value: "0", unit: "m" },
    ]);
    expect(text).not.toContain("диаметр=M0");
  });
});
