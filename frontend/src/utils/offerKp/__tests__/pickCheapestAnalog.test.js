import { describe, it, expect } from "vitest";
import {
  isAnalogAlternative,
  pickCheapestAnalog,
  resolveCheapestAnalogsForLines,
} from "../pickCheapestAnalog";

describe("pickCheapestAnalog", () => {
  it("picks cheapest priced analog", () => {
    const best = pickCheapestAnalog([
      { sku: "A", price: 40, matchType: "analog", status: "Аналог" },
      { sku: "B", price: 18.5, matchType: "analog", status: "Аналог" },
      { sku: "C", price: 22, matchType: "analog", status: "Аналог" },
    ]);
    expect(best.sku).toBe("B");
  });

  it("ignores exact and similar even if cheaper", () => {
    const best = pickCheapestAnalog([
      { sku: "exact", price: 5, matchType: "exact", status: "В наличии" },
      { sku: "sim", price: 6, matchType: "similar", status: "Требует проверки" },
      { sku: "analog", price: 30, matchType: "analog", status: "Аналог" },
    ]);
    expect(best.sku).toBe("analog");
  });

  it("skips zero/missing price analogs", () => {
    const best = pickCheapestAnalog([
      { sku: "zero", price: 0, matchType: "analog" },
      { sku: "ok", price: 12, matchType: "analog" },
    ]);
    expect(best.sku).toBe("ok");
  });

  it("detects analog via status when matchType missing", () => {
    expect(isAnalogAlternative({ status: "Аналог" })).toBe(true);
    expect(isAnalogAlternative({ status: "Zamiennik" })).toBe(true);
    expect(isAnalogAlternative({ status: "В наличии" })).toBe(false);
  });

  it("returns null when no analogs", () => {
    expect(pickCheapestAnalog([{ sku: "x", price: 1, matchType: "exact" }])).toBe(
      null
    );
    expect(pickCheapestAnalog([])).toBe(null);
  });

  it("resolveCheapestAnalogsForLines skips already-selected SKU", () => {
    const picks = resolveCheapestAnalogsForLines([
      {
        article: "KEEP",
        alternatives: [
          { sku: "KEEP", price: 10, matchType: "analog" },
          { sku: "CHEAP", price: 8, matchType: "analog" },
        ],
      },
      {
        article: "OLD",
        alternatives: [{ sku: "NEW", price: 15, matchType: "analog" }],
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
