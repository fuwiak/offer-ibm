const {
  renderGroundedCatalogResponse,
  sanitizeOfferKpHistory,
  shouldRenderCatalogDirectly,
} = require("../../../utils/offerKp/groundedResponse");

describe("OfferKP zero-latency grounding", () => {
  const block = `[Каталог · purolat.com]\nТовар: Болт DIN 933 M10x80\nЦена: 12.50 RUB\nАртикул / SKU: 123456789`;

  it("renders trusted ShopDB blocks without an LLM call", () => {
    expect(shouldRenderCatalogDirectly("найди болт DIN 933 M10x80")).toBe(true);
    expect(
      renderGroundedCatalogResponse("найди болт DIN 933 M10x80", [block])
    ).toContain("123456789");
  });

  it("abstains when ShopDB returned no candidates", () => {
    expect(
      renderGroundedCatalogResponse("найди болт DIN 933 M10x80", [])
    ).toContain("не найдено подтверждённых совпадений");
  });

  it("does not short-circuit multi-line RFQ into empty catalog abstain", () => {
    const rfq = [
      "Винт DIN 6912 M6x20 — 500 шт",
      "Винт M6x20 ГОСТ Р ИСО 1207-2013 — 500 шт",
      "Гайка М24 ГОСТ ISO 7040 — 28200 шт",
    ].join("\n");
    expect(shouldRenderCatalogDirectly(rfq)).toBe(false);
    expect(
      renderGroundedCatalogResponse(rfq, [], {
        primaryIntent: "product_inquiry",
      })
    ).toBeNull();
  });

  it("accepts a rare LLM tie-break result without another model call", () => {
    expect(
      renderGroundedCatalogResponse("цена", [block], {
        primaryIntent: "product_inquiry",
      })
    ).toContain("123456789");
  });

  it("does not intercept quote generation", () => {
    expect(renderGroundedCatalogResponse("сделай КП", [block])).toBeNull();
  });

  it("removes model-produced catalog blocks from LLM history", () => {
    const clean = sanitizeOfferKpHistory([
      { role: "user", content: "найди болт" },
      { role: "assistant", content: block },
      { role: "assistant", content: "Уточните размер." },
    ]);
    expect(clean).toHaveLength(2);
    expect(clean.some((entry) => entry.content.includes("123456789"))).toBe(
      false
    );
  });

  it("replaces invented /product/{sku} links with ShopDB draft cards", () => {
    const {
      replaceHallucinatedCatalogInChat,
      chatHasInventedCatalogFacts,
    } = require("../../../utils/offerKp/groundedResponse");
    const fake = `[Каталог · purolat.com]
Товар: Винт ГОСТ ISO 7380-1-М10×25-8.8
Цена: 12.50 RUB
Артикул / SKU: 45104992510700
Ссылка: https://purolat.com/product/45104992510700`;
    const draft = {
      lines: [
        {
          name: "Винт ГОСТ ISO 7380-1-М10×25-8.8 Zn",
          requestedName: "Винт ГОСТ ISO 7380-1-М10х25-8.8",
          article: "069280140063050",
          productId: "35291",
          unitPriceNet: 12.5,
          matchType: "exact",
          productUrl:
            "https://purolat.com/shop/vinty/vint-gost-iso-7380-1-m10x25/",
        },
      ],
    };
    expect(
      chatHasInventedCatalogFacts(fake, {
        urls: new Set([
          "https://purolat.com/shop/vinty/vint-gost-iso-7380-1-m10x25/",
        ]),
        skus: new Set(["069280140063050"]),
        productIds: new Set(["35291"]),
      })
    ).toBe(true);
    const out = replaceHallucinatedCatalogInChat(fake, { draft });
    expect(out).toContain("069280140063050");
    expect(out).toContain(
      "https://purolat.com/shop/vinty/vint-gost-iso-7380-1-m10x25/"
    );
    expect(out).not.toContain("45104992510700");
    expect(out).not.toContain("/product/45104992510700");
    expect(out).toContain("ID товара (shop_product.id): 35291");
  });
});
