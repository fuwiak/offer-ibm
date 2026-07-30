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
      isFabricatedShopUrl,
      stripFabricatedProductLinks,
    } = require("../../../utils/offerKp/groundedResponse");
    const fake = `[Каталог · purolat.com]
Товар: Винт ГОСТ ISO 7380-1-М10×25-8.8
Цена: 12.50 RUB
Артикул / SKU: 45104992510700
Категория: Винты
Ссылка: https://purolat.com/product/45104992510700
Характеристики: класс 8.8`;
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
    expect(isFabricatedShopUrl("https://purolat.com/product/45104992510700")).toBe(
      true
    );
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
    expect(
      stripFabricatedProductLinks(
        "Ссылка: https://purolat.com/product/X\nок"
      )
    ).not.toContain("/product/");
  });

  it("bans /product/{sku} even when price matches allowed catalog", () => {
    const {
      chatHasInventedCatalogFacts,
      replaceHallucinatedCatalogInChat,
    } = require("../../../utils/offerKp/groundedResponse");
    const block = `[Каталог · purolat.com] Винт M5
ID товара (shop_product.id): 9
Цена: 12.50 RUB
Ссылка: https://purolat.com/shop/vinty/real-m5/`;
    const fake = `Товар: Винт M5
Цена: 12.50 RUB
Артикул / SKU: 10642-M5x16-12.9
Ссылка: https://purolat.com/product/10642-M5x16-12.9`;
    expect(
      chatHasInventedCatalogFacts(fake, {
        urls: new Set(["https://purolat.com/shop/vinty/real-m5/"]),
        skus: new Set(["real-sku"]),
        productIds: new Set(["9"]),
      })
    ).toBe(true);
    const out = replaceHallucinatedCatalogInChat(fake, {
      catalogBlocks: [block],
    });
    expect(out).not.toContain("/product/");
    expect(out).toContain("https://purolat.com/shop/vinty/real-m5/");
  });

  it("emits a card for every draft line and builds URL from slug", () => {
    const {
      buildGroundedCatalogCardsFromDraft,
      resolvePublicProductUrl,
    } = require("../../../utils/offerKp/groundedResponse");
    const draft = {
      lines: [
        {
          requestedName: "Винт M10x25",
          name: "Винт M10x25 Zn",
          productId: "1",
          article: "SKU-1",
          unitPriceNet: 12.5,
          matchType: "exact",
          productUrl: "vint-m10x25-zn",
          categoryUrl: "vinty",
        },
        {
          requestedName: "Винт M8x70",
          name: "Винт M8x70",
          productId: "",
          unitPriceNet: 0,
          matchType: "none",
        },
      ],
    };
    const url = resolvePublicProductUrl(draft.lines[0]);
    expect(url).toMatch(/^https:\/\/purolat\.com\//);
    expect(url).toContain("vint-m10x25-zn");
    const cards = buildGroundedCatalogCardsFromDraft(draft, []);
    expect(cards).toContain("Ссылка: ");
    expect(cards).toContain("vint-m10x25-zn");
    expect(cards).toContain("нет подтверждённого совпадения");
    expect(cards.match(/\[Каталог · purolat\.com\]/g)).toHaveLength(2);
  });

  it("prefers SQL catalog block URL over draft slug", () => {
    const {
      buildGroundedCatalogCardsFromDraft,
    } = require("../../../utils/offerKp/groundedResponse");
    const block = `[Каталог · purolat.com] Винт M10
ID товара (shop_product.id): 42
Цена: 12.50 RUB
Ссылка: https://purolat.com/shop/vinty/real-slug/
SKU (shop_product_skus):
  · 069280140063050`;
    const draft = {
      lines: [
        {
          name: "Винт M10",
          productId: "42",
          unitPriceNet: 12.5,
          matchType: "exact",
          productUrl: "raw-slug-only",
        },
      ],
    };
    const out = buildGroundedCatalogCardsFromDraft(draft, [block]);
    expect(out).toContain("https://purolat.com/shop/vinty/real-slug/");
    expect(out).toContain("069280140063050");
  });

  it("does not dump draft cards into system_help-style replies", () => {
    const {
      replaceHallucinatedCatalogInChat,
    } = require("../../../utils/offerKp/groundedResponse");
    const fake = `[Каталог · purolat.com]
Товар: Болт M16
Цена: 1.00 RUB
Артикул / SKU: 10000000000000000000000000000000
Ссылка: https://purolat.com/product/fake`;
    const draft = {
      lines: [
        {
          name: "Болт M16×55",
          article: "REAL-SKU",
          productId: "1",
          unitPriceNet: 158.44,
          matchType: "exact",
          productUrl: "https://purolat.com/shop/bolty/real/",
        },
      ],
    };
    const out = replaceHallucinatedCatalogInChat(fake, {
      draft,
      injectDraftCards: false,
    });
    expect(out).not.toContain("REAL-SKU");
    expect(out).not.toContain("158.44");
    expect(out).not.toContain("10000000000000000000000000000000");
    expect(out).not.toMatch(/Товар\s*:/i);
  });
});
