const {
  validateQuotePricesFromDb,
  collectAllowedPricesFromDraft,
  sanitizeQuotePricesToShopDb,
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

  it("allows ChatGPT-style empty / под заказ when ShopDB has no price", () => {
    const content = `| № | Наименование | Кол-во | Цена | Сумма |
|---|--------------|--------|------|-------|
| 1 | Болт M10x100 | 30 | под заказ | — |
| 2 | Болт M8x20 | 15 |  | — |`;

    const result = validateQuotePricesFromDb(content, {
      draft: { lines: [{ unitPriceNet: 0, quantity: 30 }] },
    });

    expect(result.ok).toBe(true);
  });

  it("rejects invented numbers when ShopDB has zero allowed prices", () => {
    const content = `| № | Наименование | Кол-во | Цена | Сумма |
|---|--------------|--------|------|-------|
| 1 | Болт M10x100 | 30 | 99.99 | 2999.70 |`;

    const result = validateQuotePricesFromDb(content, {
      draft: { lines: [{ unitPriceNet: 0, quantity: 30 }] },
    });

    expect(result.ok).toBe(false);
    expect(result.violations[0].id).toBe("price-not-in-shopdb");
  });

  it("sanitizes invented prices to под заказ", () => {
    const content = `| № | Наименование | Кол-во | Цена | Сумма |
|---|--------------|--------|------|-------|
| 1 | Болт M10x100 | 30 | 270.10 | 8103.00 |
| 2 | Болт M8x20 | 15 | 21.27 | 319.05 |`;

    const result = sanitizeQuotePricesToShopDb(content, {
      draft: {
        lines: [{ unitPriceNet: 21.27, priceWithVat: 25.52, quantity: 15 }],
      },
    });

    expect(result.changed).toBe(true);
    expect(result.replaced).toBe(1);
    expect(result.content).toContain("под заказ");
    expect(result.content).toContain("21.27");
    expect(result.content).not.toContain("270.10");
  });
});
