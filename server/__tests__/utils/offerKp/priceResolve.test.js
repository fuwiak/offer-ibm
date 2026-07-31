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

  it("pins DIN 316 wing-screw SKU retail price from shop_product_skus.price", () => {
    // Live ShopDB shape for 003160110060020 (purolat wing screw M6x20 /100).
    const skuRows = [
      {
        sku_id: 9308,
        product_id: 18880,
        sku: "003160110060020",
        sku_name: "Винт-барашек DIN  316 M  6x 20 оцинк  (100)",
        price: "8.0300",
        compare_price: "0.0000",
        count: "29209.000",
        available: 1,
        opt_price: null,
      },
    ];
    const pinned = resolvePreferredSkuPrice(skuRows, "003160110060020");
    expect(pinned.price).toBe(8.03);
    expect(pinned.source).toBe("shop_product_skus.price");
    expect(pinned.skuMissing).toBe(false);
    expect(resolveSkuRowPrice(skuRows[0]).price).toBe(8.03);
    expect(
      resolveProductPriceWithSource(
        { price: "8.0300" },
        skuRows,
        [],
        "003160110060020"
      ).price
    ).toBe(8.03);
  });
});
