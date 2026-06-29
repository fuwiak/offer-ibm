const { resolveProductPrice } = require("../../../utils/offerKp/priceResolve");

describe("priceResolve", () => {
  it("prefers positive shop_product.price", () => {
    expect(
      resolveProductPrice({ price: 120, compare_price: 0 }, [
        { price: 99, compare_price: 0 },
      ])
    ).toBe(120);
  });

  it("falls back to SKU price when product price is zero", () => {
    expect(
      resolveProductPrice({ price: 0, compare_price: 0 }, [
        { price: 0, compare_price: 0 },
        { price: 3713.92, compare_price: 0 },
      ])
    ).toBe(3713.92);
  });

  it("uses compare_price when price missing", () => {
    expect(
      resolveProductPrice({ price: 0, compare_price: 88 }, [])
    ).toBe(88);
  });
});
