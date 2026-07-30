"use strict";

const {
  FIELD_BOOSTS,
  createBm25Index,
  technicalTokens,
} = require("../../../utils/offerKp/shopDbBm25Index");
const {
  applyCatalogCandidateQuota,
} = require("../../../utils/offerKp/nameSimilarity");

function record(productId, overrides = {}) {
  return {
    productId,
    name: "Болт DIN 933 M10x25 8.8 оцинкованный",
    categoryName: "Болты",
    skuCodes: [`0738010001000${String(productId).padStart(2, "0")}`],
    summary: "",
    description: "",
    signature: {
      productType: "болт",
      standards: ["DIN 933"],
      standardFamily: "DIN 933",
      diameter: "M10",
      length: "25 mm",
      threadPitch: "",
      strengthClass: "8.8",
      material: "сталь",
      coating: "цинк",
    },
    ...overrides,
  };
}

describe("ShopDB BM25F catalog index", () => {
  it("keeps the agreed technical-field boosts", () => {
    expect(FIELD_BOOSTS).toMatchObject({
      sku: 10,
      size: 8,
      standard: 7,
      name: 5,
      strength: 4,
      material: 3,
      coating: 3,
      category: 2,
      description: 0.5,
    });
  });

  it("normalizes SKU, standard and MxL into exact technical tokens", () => {
    expect(technicalTokens("ГОСТ 7798 M10×25 SKU 073801000100025")).toEqual(
      expect.arrayContaining([
        "stdgost7798",
        "stdnum7798",
        "sizem10x25",
        "diam10",
        "len25",
        "sku073801000100025",
      ])
    );
  });

  it("ranks exact SKU and technical size above close catalog names", () => {
    const exact = record(1, { skuCodes: ["073801000100025"] });
    const wrongLength = record(2, {
      name: "Болт DIN 933 M10x80 8.8 оцинкованный",
      signature: { ...record(2).signature, length: "80 mm" },
    });
    const wrongStandard = record(3, {
      name: "Болт DIN 931 M10x25 8.8 оцинкованный",
      signature: {
        ...record(3).signature,
        standards: ["DIN 931"],
        standardFamily: "DIN 931",
      },
    });
    const hits = createBm25Index([wrongLength, wrongStandard, exact]).search(
      "Болт DIN 933 M10x25 артикул 073801000100025",
      3
    );
    expect(hits[0].productId).toBe(1);
  });

  it("does not fuzzy-match a SKU that differs by one digit", () => {
    const exact = record(1, { skuCodes: ["009755100360002"] });
    const oneDigitAway = record(2, { skuCodes: ["009755100560002"] });
    const hits = createBm25Index([oneDigitAway, exact]).search(
      "009755100360002",
      5
    );
    expect(hits.map((hit) => hit.productId)).toEqual([1]);
  });

  it("keeps a 45 compatible + 5 approved analog candidate window", () => {
    const compatible = Array.from({ length: 48 }, (_, index) => ({
      id: index + 1,
      name: `Болт DIN 933 M10x25 8.8 оцинкованный ${index}`,
    }));
    const analogs = Array.from({ length: 8 }, (_, index) => ({
      id: index + 101,
      name: `Болт ISO 4017 M10x25 8.8 оцинкованный ${index}`,
    }));
    const wrongSize = {
      id: 999,
      name: "Болт DIN 933 M8x80 8.8 оцинкованный",
    };
    const selected = applyCatalogCandidateQuota(
      "Болт DIN 933 M10x25 8.8 оцинк",
      [...compatible, wrongSize, ...analogs],
      50
    );
    expect(selected).toHaveLength(50);
    expect(
      selected.filter((item) => item._retrievalMatchType === "analog")
    ).toHaveLength(5);
    expect(selected.some((item) => item.id === 999)).toBe(false);
  });
});
