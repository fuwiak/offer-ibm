import { describe, expect, it } from "vitest";
import { buildQuoteMarkdown } from "../buildQuoteMarkdown";

describe("buildQuoteMarkdown VAT-inclusive contract", () => {
  it("uses gross line prices and does not add VAT on top", () => {
    const markdown = buildQuoteMarkdown({
      reference: "KP-TEST",
      lines: [
        {
          name: "Болт DIN 931 M8x40",
          quantity: 2,
          unitPriceNet: 100,
          priceWithVat: 120,
          lineTotal: 240,
          status: "В наличии",
        },
      ],
      subtotal: 240,
      total: 240,
    });

    expect(markdown).toContain("120.00 RUB | 240.00 RUB");
    expect(markdown).toContain("**Подытог:** 240.00 RUB");
    expect(markdown).toContain("**Итого:** 240.00 RUB");
    expect(markdown).not.toContain("**НДС");
    expect(markdown).not.toContain("Итого с НДС");
  });
});
