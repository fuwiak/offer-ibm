"use strict";

const {
  resolveSkuRowPrice,
  resolveProductPriceWithSource,
} = require("../../../utils/offerKp/priceResolve");
const {
  refreshDraftPricesFromShopDb,
  livePriceForLine,
  recalcDraftTotals,
} = require("../../../utils/offerKp/refreshDraftPrices");
const {
  finalizeQuoteForExport,
} = require("../../../utils/offerKp/finalizeQuoteForExport");
const {
  stripIllegalPrices,
  recalcQuoteDraftTotals,
  assertExportGuards,
} = require("../../../utils/offerKp/exportGuards");

describe("resolveSkuRowPrice — no cross-SKU price mix", () => {
  it("takes price only from the given SKU row", () => {
    const cheap = { sku: "SKU-A", price: 10 };
    const expensive = { sku: "SKU-B", price: 99 };
    expect(resolveSkuRowPrice(expensive).price).toBe(99);
    expect(resolveSkuRowPrice(cheap).price).toBe(10);
    // Passing only the chosen row must not see sibling prices.
    expect(
      resolveProductPriceWithSource({}, [expensive], [{ price: 1 }]).price
    ).toBe(99);
  });

  it("does not pick sibling SKU price when resolving bestSku alone", () => {
    const bestSku = { sku: "SKU-B", price: 18.5, opt_price: null };
    const siblings = [
      { sku: "SKU-A", price: 5 },
      bestSku,
      { sku: "SKU-C", price: 40 },
    ];
    // Bug pattern: resolve over ALL siblings → would return 5 (SKU-A).
    const wrong = resolveProductPriceWithSource({}, siblings);
    expect(wrong.price).toBe(5);
    // Correct: resolve only chosen bestSku.
    const right = resolveSkuRowPrice(bestSku);
    expect(right.price).toBe(18.5);
    expect(right.price).not.toBe(wrong.price);
  });
});

describe("livePriceForLine prefers line article SKU", () => {
  it("binds price to matching sku in stock.skus", () => {
    const stock = {
      sku: "CHEAP",
      price: 5,
      skus: [
        { sku: "CHEAP", price: 5 },
        { sku: "CHOSEN", price: 22.5 },
      ],
    };
    const live = livePriceForLine(stock, { article: "CHOSEN" });
    expect(live.sku).toBe("CHOSEN");
    expect(live.price).toBe(22.5);
    expect(live.skuMissing).toBe(false);
  });

  it("never falls back to bestSku when chosen article is missing", () => {
    const stock = {
      sku: "CHEAP",
      price: 5,
      skus: [
        { sku: "CHEAP", price: 5 },
        { sku: "OTHER", price: 40 },
      ],
    };
    const live = livePriceForLine(stock, { article: "EXPENSIVE-GONE" });
    expect(live.price).toBe(0);
    expect(live.skuMissing).toBe(true);
    expect(live.sku).toBe("EXPENSIVE-GONE");
  });

  it("does not invent bestSku when article is unspecified", () => {
    const stock = {
      sku: "CHEAP",
      price: 5,
      skus: [{ sku: "CHEAP", price: 5 }],
    };
    const live = livePriceForLine(stock, { article: "" });
    expect(live.price).toBe(0);
    expect(live.skuUnspecified).toBe(true);
  });
});

describe("refreshDraftPricesFromShopDb fail-closed", () => {
  it("zeros price when product missing and failMissing=true", async () => {
    const draft = {
      lines: [
        {
          productId: "10",
          matchType: "exact",
          quantity: 2,
          unitPriceNet: 41,
          lineTotal: 82,
          allowPrice: true,
        },
      ],
      subtotal: 82,
    };
    const { draft: next, missing } = await refreshDraftPricesFromShopDb(
      draft,
      async () => new Map(),
      { failMissing: true }
    );
    expect(missing).toBe(1);
    expect(next.lines[0].unitPriceNet).toBe(0);
    expect(next.subtotal).toBe(0);
  });

  it("uses SKU-specific live price and recalculates totals", async () => {
    const draft = {
      lines: [
        {
          productId: "10",
          article: "SKU-B",
          matchType: "exact",
          quantity: 2,
          unitPriceNet: 10,
          lineTotal: 20,
          allowPrice: true,
        },
      ],
      subtotal: 20,
    };
    const stocks = new Map([
      [
        "10",
        {
          sku: "SKU-A",
          price: 5,
          skus: [
            { sku: "SKU-A", price: 5 },
            { sku: "SKU-B", price: 41.25 },
          ],
        },
      ],
    ]);
    const { draft: next, changed } = await refreshDraftPricesFromShopDb(
      draft,
      async () => stocks,
      { failMissing: true }
    );
    expect(changed).toBe(1);
    expect(next.lines[0].unitPriceNet).toBe(41.25);
    expect(next.lines[0].article).toBe("SKU-B");
    expect(next.lines[0].lineTotal).toBe(82.5);
    expect(next.subtotal).toBe(82.5);
  });
});

describe("stripIllegalPrices + recalcQuoteDraftTotals", () => {
  it("recalculates Итого after zeroing illegal lines", () => {
    const stripped = stripIllegalPrices([
      {
        matchType: "exact",
        unitPriceNet: 10,
        lineTotal: 10,
        allowPrice: true,
        productId: "1",
        article: "A",
      },
      {
        matchType: "similar",
        unitPriceNet: 50,
        lineTotal: 50,
        allowPrice: false,
        productId: "2",
        article: "B",
      },
    ]);
    const draft = recalcQuoteDraftTotals({
      lines: stripped,
      subtotal: 60,
      total: 60,
    });
    expect(draft.lines[1].lineTotal).toBe(0);
    expect(draft.subtotal).toBe(10);
    expect(draft.total).toBe(10);
  });
});

describe("finalizeQuoteForExport", () => {
  it("rejects client prices and rebinds from ShopDB mock", async () => {
    const fakeFetch = async () =>
      new Map([
        [
          "42",
          {
            sku: "REAL",
            price: 33,
            priceSource: "shop_product_skus.price",
            skus: [{ sku: "REAL", price: 33 }],
          },
        ],
      ]);

    const result = await finalizeQuoteForExport(
      {
        reference: "T-1",
        customer: { name: "Test" },
        vatRate: 0.2,
        lines: [
          {
            productId: "42",
            article: "REAL",
            matchType: "exact",
            quantity: 3,
            // Client tries to smuggle a fake price:
            unitPriceNet: 1,
            lineTotal: 3,
            allowPrice: true,
          },
        ],
        subtotal: 3,
        total: 3,
      },
      { fetchProductStocks: fakeFetch, requireSnapshot: true }
    );

    expect(result.ok).toBe(true);
    expect(result.quoteData.lines[0].unitPriceNet).toBe(33);
    expect(result.quoteData.lines[0].priceWithVat).toBe(33);
    expect(result.quoteData.lines[0].lineTotal).toBe(99);
    expect(result.quoteData.subtotal).toBe(99);
    expect(result.quoteData.priceSnapshotId).toBeTruthy();
  });

  it("blocks export when ShopDB fetch throws", async () => {
    const result = await finalizeQuoteForExport(
      {
        lines: [
          {
            productId: "1",
            matchType: "exact",
            quantity: 1,
            unitPriceNet: 10,
            allowPrice: true,
            article: "X",
          },
        ],
      },
      {
        fetchProductStocks: async () => {
          throw new Error("mysql down");
        },
        failClosedOnShopDbError: true,
      }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("shopdb_unavailable");
  });

  it("keeps explicit operatorPriceOverride", async () => {
    const fakeFetch = async () =>
      new Map([
        [
          "7",
          {
            sku: "CAT",
            price: 100,
            skus: [{ sku: "CAT", price: 100 }],
          },
        ],
      ]);
    const result = await finalizeQuoteForExport(
      {
        lines: [
          {
            productId: "7",
            article: "CAT",
            matchType: "analog",
            quantity: 1,
            unitPriceNet: 55,
            lineTotal: 55,
            allowPrice: true,
            operatorPriceOverride: true,
          },
        ],
      },
      { fetchProductStocks: fakeFetch }
    );
    expect(result.ok).toBe(true);
    expect(result.quoteData.lines[0].unitPriceNet).toBe(55);
  });

  it("blocks export when chosen article disappeared (no bestSku fallback)", async () => {
    const fakeFetch = async () =>
      new Map([
        [
          "42",
          {
            sku: "CHEAP",
            price: 5,
            skus: [
              { sku: "CHEAP", price: 5 },
              { sku: "OTHER", price: 40 },
            ],
          },
        ],
      ]);
    const result = await finalizeQuoteForExport(
      {
        lines: [
          {
            productId: "42",
            article: "EXPENSIVE-GONE",
            matchType: "exact",
            quantity: 1,
            unitPriceNet: 99,
            lineTotal: 99,
            allowPrice: true,
          },
        ],
      },
      { fetchProductStocks: fakeFetch, requireSnapshot: true }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("export_guards_failed");
    expect(
      (result.violations || []).some((v) => v.id === "sku_missing_no_fallback")
    ).toBe(true);
  });
});

describe("assertExportGuards requireSnapshot", () => {
  it("fails without priceSnapshotId when required", () => {
    const r = assertExportGuards({
      quoteLines: [
        {
          matchType: "exact",
          unitPriceNet: 1,
          productId: "1",
          article: "A",
          allowPrice: true,
        },
      ],
      draft: { lines: [] },
      requireSnapshot: true,
    });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.id === "missing_shopdb_snapshot")).toBe(
      true
    );
  });
});
