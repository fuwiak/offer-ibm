const {
  resolveProductPrice,
  resolveProductPriceWithSource,
  resolvePreferredSkuPrice,
  resolveSkuRowPrice,
} = require("../../../utils/offerKp/priceResolve");

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

  it("pins price to preferred SKU only — never cheapest sibling", () => {
    const skus = [
      { sku: "SKU-A", price: 99.5 },
      { sku: "SKU-B", price: 5.0 },
    ];
    const pinned = resolvePreferredSkuPrice(skus, "SKU-A");
    expect(pinned.price).toBe(99.5);
    expect(pinned.sku).toBe("SKU-A");
    expect(pinned.skuMissing).toBe(false);
    expect(resolveProductPriceWithSource({}, skus, [], "SKU-A").price).toBe(
      99.5
    );
  });

  it("returns no price when preferred SKU is missing (no bestSku fallback)", () => {
    const skus = [
      { sku: "SKU-A", price: 99.5 },
      { sku: "SKU-B", price: 5.0 },
    ];
    const pinned = resolvePreferredSkuPrice(skus, "SKU-GONE");
    expect(pinned.price).toBe(0);
    expect(pinned.skuMissing).toBe(true);
    expect(resolveSkuRowPrice(null).price).toBe(0);
    expect(
      resolveProductPriceWithSource({}, skus, [], "SKU-GONE").price
    ).toBe(0);
  });
});
