/* eslint-env jest, node */

const {
  multiplyLineTotal,
  evaluateSafeExpression,
  computeQuoteLines,
} = require("../../../utils/offerKp/quoteCalculator");

describe("quoteCalculator", () => {
  it("multiplies quantity by unit price with 2 decimals", () => {
    expect(multiplyLineTotal(40, 21.27)).toBe(850.8);
    expect(multiplyLineTotal(10, 33.04)).toBe(330.4);
  });

  it("evaluates spreadsheet-like expressions", () => {
    expect(evaluateSafeExpression("=40*21.27")).toBe(850.8);
    expect(evaluateSafeExpression("10*33.04")).toBe(330.4);
  });

  it("computes batch quote lines and subtotal", () => {
    const result = computeQuoteLines([
      { label: "Bolt A", quantity: 40, unitPrice: 21.27 },
      { label: "Bolt B", quantity: 10, unitPrice: 33.04 },
    ]);
    expect(result.ok).toBe(true);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].lineTotal).toBe(850.8);
    expect(result.lines[1].lineTotal).toBe(330.4);
    expect(result.subtotal).toBe(1181.2);
  });
});
