"use strict";

const {
  buildExternalLinksSection,
  isCatalogDocSource,
} = require("../../../utils/garant/linksFooter");

describe("linksFooter catalog sources", () => {
  it("treats Каталог · PDF as catalog", () => {
    expect(isCatalogDocSource("Каталог")).toBe(true);
    expect(isCatalogDocSource("Каталог · PDF")).toBe(true);
    expect(isCatalogDocSource("ГАРАНТ")).toBe(false);
  });

  it("emits markdown links for inquiry PDF catalog sources", () => {
    const block = buildExternalLinksSection([
      {
        title: "Винт ISO 7380-1 M10x25",
        docSource: "Каталог · PDF",
        url: "https://purolat.com/shop/vint/test/",
        shopProductId: 31855,
        shopDbTables: ["shop_product"],
      },
      {
        title: "duplicate same id",
        docSource: "Каталог",
        url: "https://purolat.com/shop/vint/other/",
        shopProductId: 31855,
      },
    ]);
    expect(block).toContain("**Источники каталога (MySQL):**");
    expect(block).toContain(
      "[Винт ISO 7380-1 M10x25](https://purolat.com/shop/vint/test/)"
    );
    expect(block).not.toContain("duplicate same id");
    expect(block).toContain("shop_product");
  });
});
