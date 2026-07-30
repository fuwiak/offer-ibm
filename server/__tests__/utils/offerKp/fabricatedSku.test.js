"use strict";

const {
  isFabricatedSku,
  sanitizeSku,
  stripFabricatedSkusFromText,
  stripFabricatedSkusFromLines,
} = require("../../../utils/offerKp/fabricatedSku");
const {
  stripFabricatedProductLinks,
} = require("../../../utils/offerKp/groundedResponse");

describe("fabricatedSku", () => {
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

  it("strips fabricated SKU lines from chat text", () => {
    const text = `[Каталог · purolat.com]
Товар: Болт M16
Цена: 1.00 RUB
Артикул / SKU: 10000000000000000000000000000000
Ссылка: https://purolat.com/shop/bolty/real/`;
    const out = stripFabricatedSkusFromText(text);
    expect(out).not.toContain("10000000000000000000000000000000");
    expect(out).not.toMatch(/Артикул\s*\/\s*SKU\s*:/i);
    expect(out).toContain("Болт M16");
  });

  it("stripFabricatedProductLinks also removes fake SKUs", () => {
    const out = stripFabricatedProductLinks(
      "Артикул / SKU: 10000000000000000000000000000000\nок"
    );
    expect(out).not.toContain("10000000000000000000000000000000");
  });

  it("clears fabricated article fields on draft lines", () => {
    const [line] = stripFabricatedSkusFromLines([
      { article: "10000000000000000000000000000000", sku: "069280140063050" },
    ]);
    expect(line.article).toBe("");
    expect(line.sku).toBe("069280140063050");
  });
});
