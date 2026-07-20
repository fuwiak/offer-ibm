/* eslint-env jest, node */

const {
  buildMarkdownQuote,
  computeQuoteLineStats,
} = require("../../../utils/offerKp/autoQuoteArtifacts");

describe("buildMarkdownQuote (auto DOCX/PDF)", () => {
  const base = {
    reference: "KP-AUTO",
    customer: { name: "Customer", country: "" },
    shipping: 0,
    currency: "RUB",
    vatRate: 0.2,
  };

  const lines = [
    {
      productName: "Винт ГОСТ 11738 M8x30",
      requestedName: "Винт DIN 912 M8x30",
      article: "SKU-11738",
      unit: "шт",
      quantity: 100,
      unitPrice: 12.4,
      lineTotal: 1240,
      matchType: "analog",
      analogOf: "DIN 912 → ГОСТ 11738",
    },
    {
      productName: "Шайба титановая M30",
      requestedName: "Шайба титановая M30",
      unit: "шт",
      quantity: 10,
      unitPrice: 0,
      lineTotal: 0,
      matchType: "none",
      similarSuggestion: { name: "Шайба DIN 125 M30", price: 5.2 },
    },
  ];

  it("prints — instead of 0.00, uses spec statuses and reports counts", () => {
    const md = buildMarkdownQuote({ ...base, lines });

    // В ячейках таблицы не должно быть 0.00 вместо отсутствующей цены.
    expect(md).not.toMatch(/\|\s*0\.00\s*\|/);
    expect(md).toContain("Предложен аналог");
    expect(md).toContain("АНАЛОГ: вместо «Винт DIN 912 M8x30»");
    expect(md).toMatch(/\| 2 \|[^\n]*\| Нет в базе \|/);
    expect(md).toContain(
      "Точный товар отсутствует. Подходящий аналог не найден"
    );
    expect(md).toContain("похожий вариант: «Шайба DIN 125 M30» — 5.20 RUB");
    expect(md).toContain("| Комментарий |");
    expect(md).toContain("точных: 0, аналогов: 1, нет в базе: 1, без цены: 1");
    expect(md).toContain("Сумма рассчитанных позиций:** 1240.00 RUB");
    expect(md).toContain(
      "Итоговая сумма рассчитана только по позициям с доступной ценой"
    );
  });

  it("computeQuoteLineStats counts statuses and calculated subtotal", () => {
    const stats = computeQuoteLineStats(lines);
    expect(stats.totalCount).toBe(2);
    expect(stats.exactCount).toBe(0);
    expect(stats.analogCount).toBe(1);
    expect(stats.notInDbCount).toBe(1);
    expect(stats.noPriceCount).toBe(1);
    expect(stats.calculatedSubtotal).toBeCloseTo(1240);
  });
});
