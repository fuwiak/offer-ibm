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
});
