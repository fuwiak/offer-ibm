const {
  validateQuotePricesFromDb,
  collectAllowedPricesFromDraft,
} = require("../../../utils/offerKp/quoteDbPriceGate");

describe("quoteDbPriceGate", () => {
  it("collects net and gross prices from inquiry draft", () => {
    const allowed = collectAllowedPricesFromDraft({
      lines: [{ unitPriceNet: 21.27, priceWithVat: 25.52 }],
    });
    expect(allowed.has(21.27)).toBe(true);
    expect(allowed.has(25.52)).toBe(true);
  });

  it("rejects invented price not in ShopDB draft", () => {
    const content = `| № | Наименование | Кол-во | Цена | Сумма |
|---|--------------|--------|------|-------|
| 1 | Болт M10x100 | 30 | 270.10 | 8103.00 |`;

    const result = validateQuotePricesFromDb(content, {
      draft: {
        lines: [{ unitPriceNet: 21.27, priceWithVat: 25.52, quantity: 30 }],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.violations[0].id).toBe("price-not-in-shopdb");
  });

  it("accepts price matching ShopDB draft", () => {
    const content = `| № | Наименование | Кол-во | Цена | Сумма |
|---|--------------|--------|------|-------|
| 1 | Болт M10x100 | 30 | 25.52 | 765.60 |`;

    const result = validateQuotePricesFromDb(content, {
      draft: {
        lines: [{ unitPriceNet: 21.27, priceWithVat: 25.52, quantity: 30 }],
      },
    });

    expect(result.ok).toBe(true);
  });
});
