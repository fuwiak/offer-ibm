const { resolveProductPrice } = require("../../../utils/offerKp/priceResolve");

describe("catalog price excerpt", () => {
  it("uses SKU price when shop_product.price is zero", () => {
    const price = resolveProductPrice(
      { price: 0, currency: "RUB" },
      [{ price: 1250.5, compare_price: 0 }]
    );
    expect(price).toBe(1250.5);
  });
});
