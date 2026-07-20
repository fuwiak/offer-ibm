/* eslint-env jest, node */

const {
  buildQuoteMarkdownFromDraft,
} = require("../../../utils/offerKp/inquiryDraftPrompt");

describe("buildQuoteMarkdownFromDraft", () => {
  it("builds one row per draft line and does not reuse a single price", () => {
    const md = buildQuoteMarkdownFromDraft({
      reference: "KP-TEST",
      lines: [
        {
          requestedName: "Болт M10x100",
          name: "Болт DIN 931 M10x100",
          quantity: 30,
          unit: "кг",
          unitPriceNet: 45.0,
          lineTotal: 1620,
          status: "В наличии",
          matchType: "exact",
        },
        {
          requestedName: "Болт M6x25",
          name: "Болт M6x25",
          quantity: 3,
          unit: "кг",
          unitPriceNet: 0,
          lineTotal: 0,
          status: "под заказ",
          matchType: "none",
        },
        {
          requestedName: "Болт M8x40",
          name: "Болт DIN 933 M8x40",
          quantity: 50,
          unit: "кг",
          unitPriceNet: 22.5,
          lineTotal: 1350,
          status: "В наличии",
          matchType: "exact",
        },
      ],
    });

    expect(md).toContain("| 1 |");
    expect(md).toContain("| 2 |");
    expect(md).toContain("| 3 |");
    expect(md).toContain("45.00");
    expect(md).toContain("22.50");
    expect(md).toMatch(/\| 2 \|[^|]+\| 3 \| кг \| — \|/);
    expect(md).not.toMatch(/M6x25[\s\S]*18\.50/);
    expect(md).toContain("Всего позиций | 3");
  });
});
