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

  it("clearly labels analogs and missing products", () => {
    const md = buildQuoteMarkdownFromDraft({
      reference: "KP-TEST",
      lines: [
        {
          requestedName: "Винт DIN 912 M8x30",
          name: "Винт ГОСТ 11738 M8x30",
          quantity: 100,
          unit: "шт",
          unitPriceNet: 12.4,
          status: "Аналог",
          matchType: "analog",
          analogOf: "DIN 912 → ГОСТ 11738",
        },
        {
          requestedName: "Шайба титановая M30",
          name: "Шайба титановая M30",
          quantity: 10,
          unit: "шт",
          unitPriceNet: 0,
          status: "Нет в наличии",
          matchType: "none",
          similarSuggestion: {
            name: "Шайба DIN 125 M30",
            price: 5.2,
          },
        },
      ],
    });

    // Аналог — явный маркер с запрошенным и предложенным товаром.
    expect(md).toContain("АНАЛОГ — вместо «Винт DIN 912 M8x30»");
    expect(md).toContain("«Винт ГОСТ 11738 M8x30»");
    expect(md).toContain("DIN 912 → ГОСТ 11738");
    // Нет товара — явный текст + похожий вариант без подстановки его цены в колонку цены.
    expect(md).toContain("Нет такого товара в каталоге — под заказ");
    expect(md).toContain("похожий: «Шайба DIN 125 M30» — 5.20 RUB");
    expect(md).toMatch(/\| 2 \|[^|]+\| 10 \| шт \| — \| — \|/);
    expect(md).toContain("Из них аналогов | 1");
    expect(md).toContain("аналогов: 1, нет в каталоге: 1");
  });
});
