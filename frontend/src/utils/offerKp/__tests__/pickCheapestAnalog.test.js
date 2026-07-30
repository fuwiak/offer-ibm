import { describe, it, expect } from "vitest";
import {
  isAnalogAlternative,
  isInStockAlternative,
  pickCheapestAnalog,
  resolveCheapestAnalogsForLines,
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

  it("falls back to cheapest priced when no stock signals", () => {
    const best = pickCheapestAnalog([
      { sku: "exact", price: 5, matchType: "exact" },
      { sku: "sim", price: 6, matchType: "similar" },
      { sku: "analog", price: 30, matchType: "analog" },
    ]);
    expect(best.sku).toBe("exact");
  });

  it("skips zero/missing price when priced options exist", () => {
    const best = pickCheapestAnalog([
      { sku: "zero", price: 0, matchType: "analog", stockCount: 9 },
      { sku: "ok", price: 12, matchType: "analog", stockCount: 2 },
    ]);
    expect(best.sku).toBe("ok");
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

  it("resolveCheapestAnalogsForLines uses menu options and skips current SKU", () => {
    const picks = resolveCheapestAnalogsForLines([
      {
        article: "KEEP",
        alternatives: [
          { sku: "KEEP", price: 10, matchType: "exact", stockCount: 5 },
          { sku: "CHEAP", price: 8, matchType: "similar", stockCount: 20 },
        ],
      },
      {
        article: "OLD",
        alternatives: [
          { sku: "OLD", price: 40, matchType: "exact", stockCount: 0 },
          { sku: "NEW", price: 15, matchType: "exact", stockCount: 7 },
        ],
      },
      {
        article: "NONE",
        alternatives: [{ sku: "x", price: 1, matchType: "exact" }],
      },
    ]);
    expect(picks).toHaveLength(2);
    expect(picks[0].alt.sku).toBe("CHEAP");
    expect(picks[1].alt.sku).toBe("NEW");
  });
});
