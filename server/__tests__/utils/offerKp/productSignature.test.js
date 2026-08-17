"use strict";

const {
  buildProductSignature,
  buildQuerySignature,
  signatureHardConflicts,
  signaturesMatchForPricing,
  signatureIdentityKey,
} = require("../../../utils/offerKp/canonicalProductText");
const { validateCandidate } = require("../../../utils/offerKp/matching/constraintValidator");

describe("product signature", () => {
  const bolt60 = {
    id: 1,
    name: "Болт DIN 933 M10x60 8.8 оцинк",
    category_name: "болт",
  };
  const bolt80 = {
    id: 2,
    name: "Болт DIN 933 M10x80 8.8 оцинк",
    category_name: "болт",
  };
  const features60 = [
    { name: "Диаметр", value: "10", unit: "mm" },
    { name: "Длина", value: "60", unit: "mm" },
    { name: "Кл. пр. / Характеристика", value: "8.8" },
    { name: "DIN/ГОСТ/ISO", value: "933" },
  ];
  const features80 = [
    { name: "Диаметр", value: "10", unit: "mm" },
    { name: "Длина", value: "80", unit: "mm" },
    { name: "Кл. пр. / Характеристика", value: "8.8" },
    { name: "DIN/ГОСТ/ISO", value: "933" },
  ];

  it("exposes named signature fields", () => {
    const sig = buildProductSignature(bolt60, features60);
    expect(sig).toMatchObject({
      productType: "болт",
      standardFamily: "DIN 933",
      diameter: "M10",
      length: "60 mm",
      fullOrPartialThread: "полная",
      strengthClass: "8.8",
      coating: "цинк",
      headType: "шестигранная",
    });
  });

  it("hard-rejects M10x80 when query asks M10x60", () => {
    const query = buildQuerySignature("Болт DIN 933 M10x60");
    const product = buildProductSignature(bolt80, features80);
    expect(signatureHardConflicts(query, product)).toContain("length");
  });

  it("does not treat same-size coating variants as hard conflicts", () => {
    const query = buildQuerySignature("Болт DIN 933 M10x60 8.8");
    const product = buildProductSignature(
      { ...bolt60, name: "Болт DIN 933 M10x60 8.8 без покрытия" },
      features60
    );
    expect(signatureHardConflicts(query, product)).toEqual([]);
  });

  it("matches pricing clusters only inside identical critical signature", () => {
    const a = buildProductSignature(bolt60, features60);
    const b = buildProductSignature(bolt80, features80);
    const c = buildProductSignature(
      { ...bolt60, name: "Болт DIN 933 M10x60 8.8 без покрытия" },
      features60
    );
    expect(signaturesMatchForPricing(a, b)).toBe(false);
    expect(signaturesMatchForPricing(a, c)).toBe(true);
    expect(signatureIdentityKey(a)).toContain("m10");
  });

  it("constraintValidator demotes wrong length via signature", () => {
    const product = {
      name: bolt80.name,
      _signature: buildProductSignature(bolt80, features80),
      matchType: "exact",
    };
    const result = validateCandidate("Болт DIN 933 M10x60", product);
    expect(result.ok).toBe(false);
    expect(result.hard).toContain("length_mismatch");
  });

  it("keeps ГОСТ 7805 vs DIN 933 analog (does not hard-fail standardFamily)", () => {
    const product = {
      name: "Болт DIN 933 M 12x 40 8.8 оцинк / ГОСТ 7805-70",
      matchType: "analog",
    };
    const result = validateCandidate(
      "Болт М12-6gx40.88.019 ГОСТ 7805-70",
      product
    );
    expect(result.hard).not.toContain("standard_mismatch");
    expect(result.ok).toBe(true);
  });
});
