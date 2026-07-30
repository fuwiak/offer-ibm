"use strict";

const {
  isFabricatedSku,
  sanitizeSku,
  isGroundedSku,
  groundSku,
  lineMayCarrySku,
  stripUngroundedSkusFromText,
  stripUngroundedSkusFromLines,
} = require("../../../utils/offerKp/fabricatedSku");
const {
  stripFabricatedProductLinks,
  collectAllowedCatalogFacts,
} = require("../../../utils/offerKp/groundedResponse");

describe("fabricatedSku / grounded SKU", () => {
  it("flags classic LLM filler SKUs", () => {
    expect(isFabricatedSku("10000000000000000000000000000000")).toBe(true);
    expect(isFabricatedSku("0000000000")).toBe(true);
    expect(isFabricatedSku("111111111111")).toBe(true);
    expect(isFabricatedSku("fake")).toBe(true);
    expect(sanitizeSku("10000000000000000000000000000000")).toBe("");
  });

  it("keeps real ShopDB-looking SKUs", () => {
    expect(isFabricatedSku("069280140063050")).toBe(false);
    expect(isFabricatedSku("45104992510700")).toBe(false);
    expect(sanitizeSku("069280140063050")).toBe("069280140063050");
  });

  it("requires allowlist for grounding", () => {
    expect(isGroundedSku("069280140063050", new Set())).toBe(false);
    expect(
      isGroundedSku("069280140063050", new Set(["069280140063050"]))
    ).toBe(true);
    expect(groundSku("069280140063050", new Set(["other"]))).toBe("");
    expect(
      groundSku("069280140063050", new Set(["069280140063050"]))
    ).toBe("069280140063050");
  });

  it("lineMayCarrySku only for ShopDB exact/analog", () => {
    expect(lineMayCarrySku({ productId: "1", matchType: "exact" })).toBe(true);
    expect(lineMayCarrySku({ productId: "1", matchType: "analog" })).toBe(true);
    expect(lineMayCarrySku({ productId: "1", matchType: "similar" })).toBe(
      false
    );
    expect(lineMayCarrySku({ productId: "", matchType: "exact" })).toBe(false);
  });

  it("strips SKUs not in ShopDB allowlist from chat text", () => {
    const text = `Товар: Болт
Артикул / SKU: 069280140063050
Артикул / SKU: 99999999999999
Артикул / SKU: 10000000000000000000000000000000`;
    const out = stripUngroundedSkusFromText(
      text,
      new Set(["069280140063050"])
    );
    expect(out).toContain("069280140063050");
    expect(out).not.toContain("99999999999999");
    expect(out).not.toContain("10000000000000000000000000000000");
  });

  it("strips all SKU claims when allowlist is empty", () => {
    const out = stripUngroundedSkusFromText(
      "Артикул / SKU: 069280140063050\nок",
      new Set()
    );
    expect(out).not.toContain("069280140063050");
    expect(out).toContain("ок");
  });

  it("stripFabricatedProductLinks grounds against allowlist", () => {
    const out = stripFabricatedProductLinks(
      "Артикул / SKU: 45104992510700\nАртикул / SKU: 10000000000000000000000000000000",
      new Set(["45104992510700"])
    );
    expect(out).toContain("45104992510700");
    expect(out).not.toContain("10000000000000000000000000000000");
  });

  it("clears ungrounded article on draft lines", () => {
    const [a, b] = stripUngroundedSkusFromLines([
      {
        productId: "1",
        matchType: "exact",
        article: "069280140063050",
      },
      {
        productId: "",
        matchType: "none",
        article: "069280140063050",
      },
    ]);
    expect(a.article).toBe("069280140063050");
    expect(b.article).toBe("");
  });

  it("collectAllowedCatalogFacts only takes exact/analog draft SKUs", () => {
    const facts = collectAllowedCatalogFacts(
      {
        lines: [
          {
            productId: "1",
            matchType: "exact",
            article: "069280140063050",
          },
          {
            productId: "2",
            matchType: "similar",
            article: "45104992510700",
          },
        ],
      },
      []
    );
    expect([...facts.skus]).toEqual(["069280140063050"]);
  });
});
