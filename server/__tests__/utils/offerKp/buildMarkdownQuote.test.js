/* eslint-env jest, node */

const {
  buildMarkdownQuote,
} = require("../../../utils/offerKp/autoQuoteArtifacts");

describe("buildMarkdownQuote (auto DOCX/PDF)", () => {
  const base = {
    reference: "KP-AUTO",
    customer: { name: "Customer", country: "" },
    subtotal: 1240,
    shipping: 0,
    total: 1240,
    currency: "RUB",
    vatRate: 0.2,
    vatAmount: 248,
  };

  it("prints — instead of 0.00 for lines without ShopDB price and labels analogs", () => {
    const md = buildMarkdownQuote({
      ...base,
      lines: [
        {
          productName: "Винт ГОСТ 11738 M8x30",
          requestedName: "Винт DIN 912 M8x30",
          quantity: 100,
          unitPrice: 12.4,
          lineTotal: 1240,
          matchType: "analog",
          analogOf: "DIN 912 → ГОСТ 11738",
        },
        {
          productName: "Шайба титановая M30",
          quantity: 10,
          unitPrice: 0,
          lineTotal: 0,
          matchType: "none",
          similarSuggestion: { name: "Шайба DIN 125 M30", price: 5.2 },
        },
      ],
    });

    // В ячейках таблицы не должно быть 0.00 вместо отсутствующей цены.
    expect(md).not.toMatch(/\|\s*0\.00 RUB\s*\|/);
    expect(md).toContain("АНАЛОГ — вместо «Винт DIN 912 M8x30»");
    expect(md).toContain("Нет такого товара в каталоге — под заказ");
    expect(md).toContain("похожий: «Шайба DIN 125 M30» — 5.20 RUB");
    expect(md).toContain("| Статус |");
    expect(md).toContain("аналогов: 1, нет в каталоге: 1");
    expect(md).toMatch(/\| 2 \|[^|]+\| 10 \| — \| — \|/);
  });
});
