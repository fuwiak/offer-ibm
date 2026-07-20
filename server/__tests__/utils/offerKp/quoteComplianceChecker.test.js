/* eslint-env jest, node */

const {
  checkQuoteCompliance,
  parseMarkdownTable,
} = require("../../../utils/offerKp/quoteComplianceChecker");

const VALID_TABLE = `
| Позиция | Кол-во | Цена за шт. (RUB) | Сумма (RUB) |
| --- | --- | --- | --- |
| Болт DIN 931 M10x100 10.9 | 40 | 21.27 | 850.80 |
| Болт DIN 931 M10x100 12.9 | 10 | 33.04 | 330.40 |
`;

describe("quoteComplianceChecker", () => {
  it("accepts a valid quote table with computed sums", () => {
    const result = checkQuoteCompliance({
      content: VALID_TABLE,
      skillName: "create-docx-file",
    });
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("rejects formula sums", () => {
    const content = `
| Позиция | Кол-во | Цена | Сумма |
| --- | --- | --- | --- |
| Болт | 40 | 21.27 | =40*21.27 |
`;
    const result = checkQuoteCompliance({ content });
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.id)).toEqual(
      expect.arrayContaining(["no-formula-sums"])
    );
  });

  it("rejects wrong line totals", () => {
    const content = `
| Позиция | Кол-во | Цена | Сумма |
| --- | --- | --- | --- |
| Болт | 40 | 21.27 | 999.00 |
`;
    const result = checkQuoteCompliance({ content });
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.id)).toContain("correct-line-totals");
  });

  it("rejects zero quantity with invalid-quantity, not numeric-prices", () => {
    const content = `
| Позиция | Кол-во | Цена | Сумма |
| --- | --- | --- | --- |
| Болт | 0 | 21.27 | 0.00 |
`;
    const result = checkQuoteCompliance({ content });
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.id)).toContain("invalid-quantity");
    expect(result.violations.map((v) => v.id)).not.toContain("numeric-prices");
  });

  it("allows ChatGPT-style pending price without numeric-prices violation", () => {
    const content = `
| Позиция | Кол-во | Цена | Сумма |
| --- | --- | --- | --- |
| Болт M10x100 | 30 | под заказ | — |
| Болт M8x20 | 15 | 21.27 | 319.05 |
`;
    const result = checkQuoteCompliance({ content });
    expect(result.ok).toBe(true);
  });
});
