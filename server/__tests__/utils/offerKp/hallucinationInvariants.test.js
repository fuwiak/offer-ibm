"use strict";

/**
 * Domain anti-hallucination invariants for OfferKP.
 *
 * These are the evals that matter more than generic accuracy:
 *   - false_exact_rate  → size/type mismatch must never be "exact"
 *   - wrong_price_rate  → only exact/analog may carry a catalog price into the quote line
 *
 * Pure unit tests — no ShopDB, no LLM.
 */

const { classifyProductMatch } = require("../../../utils/offerKp/analogRules");
const {
  validateQuotePricesFromDb,
} = require("../../../utils/offerKp/quoteDbPriceGate");

const BOLT = {
  name: "Болт DIN 933 M10x80 8.8 оцинкованный",
  stockCount: 12,
};

/** Mirrors matchInquiryLines.js price policy (exact/analog only). */
function lineUnitPriceFromMatch(matchType, catalogPrice) {
  const accepted = matchType === "exact" || matchType === "analog";
  return accepted ? Number(catalogPrice) || 0 : 0;
}

describe("hallucination invariants: false exact", () => {
  it.each([
    ["length mismatch M10x70 vs M10x80", "болт DIN 933 M10x70"],
    ["diameter mismatch M12 vs M10", "болт DIN 933 M12x80"],
    ["product type nut vs bolt", "гайка DIN 933 M10x80"],
    ["underspecified — no length", "болт DIN 933 M10"],
    ["underspecified — no size at all", "болт DIN 933"],
  ])("%s must not be exact", (_label, query) => {
    const result = classifyProductMatch(query, BOLT);
    expect(result.matchType).not.toBe("exact");
  });

  it("fully specified matching query is exact", () => {
    expect(classifyProductMatch("болт DIN 933 M10x80", BOLT).matchType).toBe(
      "exact"
    );
  });
});

describe("hallucination invariants: wrong price policy", () => {
  it.each([
    ["exact", 41.25, 41.25],
    ["analog", 18.5, 18.5],
    ["similar", 99.99, 0],
    ["size_mismatch", 41.25, 0],
    ["size_unconfirmed", 41.25, 0],
    ["spec_mismatch", 41.25, 0],
    ["none", 41.25, 0],
  ])(
    "matchType=%s with catalog price %s → line unitPrice %s",
    (matchType, catalogPrice, expectedLinePrice) => {
      expect(lineUnitPriceFromMatch(matchType, catalogPrice)).toBe(
        expectedLinePrice
      );
    }
  );

  it("rejects a fabricated table price that is not in the ShopDB draft", () => {
    const content = `| № | Наименование | Кол-во | Цена | Сумма |
|---|--------------|--------|------|-------|
| 1 | Болт M10x80 | 100 | 999.00 | 99900.00 |`;

    const result = validateQuotePricesFromDb(content, {
      draft: {
        lines: [{ unitPriceNet: 41.25, priceWithVat: 49.5, quantity: 100 }],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.id === "price-not-in-shopdb")).toBe(
      true
    );
  });

  it("accepts ShopDB draft price and rejects inventing one when draft has zero", () => {
    const withPrice = `| № | Наименование | Кол-во | Цена | Сумма |
|---|--------------|--------|------|-------|
| 1 | Болт M10x80 | 10 | 49.50 | 495.00 |`;

    expect(
      validateQuotePricesFromDb(withPrice, {
        draft: {
          lines: [{ unitPriceNet: 41.25, priceWithVat: 49.5, quantity: 10 }],
        },
      }).ok
    ).toBe(true);

    const invented = `| № | Наименование | Кол-во | Цена | Сумма |
|---|--------------|--------|------|-------|
| 1 | Болт M10x80 | 10 | 12.34 | 123.40 |`;

    expect(
      validateQuotePricesFromDb(invented, {
        draft: { lines: [{ unitPriceNet: 0, quantity: 10 }] },
      }).ok
    ).toBe(false);
  });
});
