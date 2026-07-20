import { describe, expect, it } from "vitest";
import { buildQuoteMarkdown } from "../buildQuoteMarkdown";

describe("buildQuoteMarkdown VAT contract", () => {
  it("keeps line/subtotal net and adds VAT exactly once", () => {
    const markdown = buildQuoteMarkdown({
      reference: "KP-TEST",
      lines: [
        {
          name: "Болт DIN 931 M8x40",
          quantity: 2,
          unitPriceNet: 100,
          priceWithVat: 120,
          lineTotal: 200,
          status: "В наличии",
        },
      ],
      subtotal: 200,
      total: 200,
      vatRate: 0.2,
    });

    expect(markdown).toContain("120.00 RUB | 240.00 RUB");
    expect(markdown).toContain("**Подытог:** 200.00 RUB");
    expect(markdown).toContain("**НДС 20%:** 40.00 RUB");
    expect(markdown).toContain("**Итого с НДС:** 240.00 RUB");
    expect(markdown).not.toContain("288.00");
  });
});
