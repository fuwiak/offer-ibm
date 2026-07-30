const { resolveProductPrice } = require("../../../utils/offerKp/priceResolve");

describe("priceResolve", () => {
  it("prefers positive shop_product_skus.price", () => {
    expect(
      resolveProductPrice({ price: 120, compare_price: 0 }, [
        { price: 99, compare_price: 0 },
      ])
    ).toBe(99);
  });

  it("falls back to SKU price when product price is zero", () => {
    expect(
      resolveProductPrice({ price: 0, compare_price: 0 }, [
        { price: 0, compare_price: 0 },
        { price: 3713.92, compare_price: 0 },
      ])
    ).toBe(3713.92);
  });

  it("never uses compare_price as the current price", () => {
    expect(resolveProductPrice({ price: 0, compare_price: 88 }, [])).toBe(0);
  });

  it("uses explicitly supplied shop_opt_prices only after SKU and product", () => {
    expect(
      resolveProductPrice(
        { price: 0, compare_price: 100 },
        [{ price: 0, compare_price: 90 }],
        [{ price: 75 }]
      )
    ).toBe(75);
  });
});
