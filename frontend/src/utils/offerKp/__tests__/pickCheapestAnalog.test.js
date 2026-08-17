import { describe, it, expect } from "vitest";
import {
  isAnalogAlternative,
  isInStockAlternative,
  pickCheapestAnalog,
  resolveCheapestAnalogsForLines,
  explainCheapestAnalogsEmpty,
  sortAlternativesByName,
} from "../pickCheapestAnalog";

describe("pickCheapestAnalog", () => {
  it("picks cheapest in-stock alternative from the menu list", () => {
    const best = pickCheapestAnalog([
      { sku: "A", price: 40, matchType: "exact", stockCount: 5 },
      { sku: "B", price: 18.5, matchType: "similar", stockCount: 12 },
      { sku: "C", price: 22, matchType: "analog", stockCount: 3 },
    ]);
    expect(best.sku).toBe("B");
  });

  it("prefers in-stock over cheaper out-of-stock", () => {
    const best = pickCheapestAnalog([
      { sku: "oos", price: 5, matchType: "analog", stockCount: 0 },
      {
        sku: "stock",
        price: 30,
        matchType: "exact",
        status: "В наличии",
        stockCount: 4,
      },
    ]);
    expect(best.sku).toBe("stock");
  });

  it("returns null when no in-stock priced options (no OOS fallback)", () => {
    expect(
      pickCheapestAnalog([
        { sku: "exact", price: 5, matchType: "exact", stockCount: 0 },
        { sku: "sim", price: 6, matchType: "similar", stockCount: 0 },
        { sku: "analog", price: 30, matchType: "analog", stockCount: 0 },
      ])
    ).toBe(null);
  });

  it("skips zero/missing price even when in stock", () => {
    const best = pickCheapestAnalog([
      { sku: "zero", price: 0, matchType: "analog", stockCount: 9 },
      { sku: "ok", price: 12, matchType: "analog", stockCount: 2 },
    ]);
    expect(best.sku).toBe("ok");
  });

  it("returns null when only zero-price in-stock options", () => {
    expect(
      pickCheapestAnalog([
        { sku: "zero", price: 0, matchType: "exact", stockCount: 9 },
      ])
    ).toBe(null);
  });

  it("detects analog via status when matchType missing", () => {
    expect(isAnalogAlternative({ status: "Аналог" })).toBe(true);
    expect(isAnalogAlternative({ status: "Zamiennik" })).toBe(true);
    expect(isAnalogAlternative({ status: "В наличии" })).toBe(false);
  });

  it("detects in-stock via status", () => {
    expect(isInStockAlternative({ status: "В наличии" })).toBe(true);
    expect(isInStockAlternative({ stockCount: 3 })).toBe(true);
    expect(isInStockAlternative({ stockCount: 0, status: "Под заказ" })).toBe(
      false
    );
  });

  it("returns null when empty", () => {
    expect(pickCheapestAnalog([])).toBe(null);
  });

  it("explainCheapestAnalogsEmpty distinguishes all out-of-stock", () => {
    expect(
      explainCheapestAnalogsEmpty([
        {
          status: "Нет в наличии",
          stockCount: 0,
          alternatives: [
            { sku: "A", price: 5, stockCount: 0 },
            { sku: "B", price: 6, stockCount: 0 },
          ],
        },
        {
          status: "Нет в наличии",
          alternatives: [{ sku: "x", price: 1, stockCount: 0 }],
        },
      ])
    ).toBe("out_of_stock");
  });

  it("explainCheapestAnalogsEmpty reports already_best", () => {
    expect(
      explainCheapestAnalogsEmpty([
        {
          article: "KEEP",
          unitPriceNet: 10,
          status: "В наличии",
          stockCount: 5,
          alternatives: [
            { sku: "KEEP", price: 10, matchType: "exact", stockCount: 5 },
            { sku: "DEAR", price: 40, matchType: "analog", stockCount: 2 },
          ],
        },
      ])
    ).toBe("already_best");
  });

  it("resolveCheapestAnalogsForLines uses menu options and skips current SKU", () => {
    const picks = resolveCheapestAnalogsForLines([
      {
        article: "KEEP",
        unitPriceNet: 8,
        alternatives: [
          { sku: "KEEP", price: 10, matchType: "exact", stockCount: 5 },
          { sku: "CHEAP", price: 8, matchType: "similar", stockCount: 20 },
        ],
      },
      {
        article: "OLD",
        unitPriceNet: 40,
        alternatives: [
          { sku: "OLD", price: 40, matchType: "exact", stockCount: 0 },
          { sku: "NEW", price: 15, matchType: "exact", stockCount: 7 },
        ],
      },
      {
        article: "NONE",
        alternatives: [{ sku: "x", price: 1, matchType: "exact", stockCount: 1 }],
      },
    ]);
    expect(picks).toHaveLength(2);
    expect(picks[0].alt.sku).toBe("CHEAP");
    expect(picks[1].alt.sku).toBe("NEW");
  });

  it("re-applies when same SKU but draft line has no price", () => {
    const picks = resolveCheapestAnalogsForLines([
      {
        article: "SAME",
        unitPriceNet: 0,
        priceWithVat: 0,
        alternatives: [
          { sku: "OTHER", price: 20, matchType: "similar", stockCount: 0 },
          { sku: "SAME", price: 12, matchType: "exact", stockCount: 5 },
        ],
      },
    ]);
    expect(picks).toHaveLength(1);
    expect(picks[0].alt.sku).toBe("SAME");
    expect(picks[0].alt.price).toBe(12);
  });

  it("sortAlternativesByName orders by product name", () => {
    const sorted = sortAlternativesByName([
      { name: "Шайба М10" },
      { name: "Болт М8" },
      { name: "Гайка М12" },
    ]);
    expect(sorted.map((a) => a.name)).toEqual([
      "Болт М8",
      "Гайка М12",
      "Шайба М10",
    ]);
  });
});
