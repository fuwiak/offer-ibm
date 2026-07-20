/* eslint-env jest, node */

const {
  buildQuoteMarkdownFromDraft,
  resolveKpStatus,
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
    // Строка 2 (нет в базе): кол-во 3 кг, цена и сумма «—».
    expect(md).toMatch(/\| 2 \|[^\n]*\| кг \| 3 \| — \| — \|/);
    expect(md).not.toMatch(/M6x25[\s\S]*18\.50/);
    expect(md).toContain("Всего позиций | 3");
  });

  it("clearly labels analogs and missing products with spec statuses", () => {
    const md = buildQuoteMarkdownFromDraft({
      reference: "KP-TEST",
      lines: [
        {
          requestedName: "Винт DIN 912 M8x30",
          name: "Винт ГОСТ 11738 M8x30",
          article: "SKU-11738",
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

    // Аналог — статус из регламента + явный комментарий с запрошенным и предложенным.
    expect(md).toContain("Предложен аналог");
    expect(md).toContain("АНАЛОГ: вместо «Винт DIN 912 M8x30»");
    expect(md).toContain("«Винт ГОСТ 11738 M8x30»");
    expect(md).toContain("DIN 912 → ГОСТ 11738");
    // Нет в базе — позиция сохранена, «Нет в базе», цена/сумма «—», комментарий по регламенту.
    expect(md).toMatch(/\| 2 \|[^\n]*\| Нет в базе \|/);
    expect(md).toContain(
      "Точный товар отсутствует. Подходящий аналог не найден"
    );
    expect(md).toContain("похожий вариант: «Шайба DIN 125 M30» — 5.20 RUB");
    expect(md).toContain("точных: 0, аналогов: 1, нет в базе: 1, без цены: 1");
    expect(md).toContain(
      "Итоговая сумма рассчитана только по позициям с доступной ценой"
    );
    expect(md).toContain("Предложен аналог | 1");
    expect(md).toContain("Нет в базе | 1");
  });

  it("does not compute sums for non-piece units and marks price-on-request", () => {
    const md = buildQuoteMarkdownFromDraft({
      reference: "KP-TEST",
      vatRate: 0.2,
      lines: [
        {
          requestedName: "Болт M10x100",
          name: "Болт DIN 931 M10x100",
          quantity: 30,
          unit: "кг",
          unitPriceNet: 45.0,
          matchType: "exact",
          kpStatus: "Требуется проверка",
          unitNeedsRecalc: true,
          comment:
            "Требуется уточнение пересчёта единиц измерения (заявка в «кг»)",
        },
        {
          requestedName: "Гайка DIN 934 M12",
          name: "Гайка DIN 934 M12",
          quantity: 500,
          unit: "шт",
          unitPriceNet: 0,
          matchType: "exact",
          kpStatus: "Цена по запросу",
        },
      ],
    });

    // Требуется проверка: цена показана, сумма не рассчитана.
    expect(md).toMatch(/\| 1 \|[^\n]*\| 45\.00 \| — \|/);
    expect(md).toContain("Требуется уточнение пересчёта единиц измерения");
    // Цена по запросу: товар в КП, цена «Цена по запросу», сумма «—».
    expect(md).toMatch(/\| 2 \|[^\n]*\| Цена по запросу \| — \|/);
    expect(md).toContain("Сумма рассчитанных позиций | 0.00 RUB");
  });
});

describe("resolveKpStatus", () => {
  it("maps draft lines to spec statuses", () => {
    expect(resolveKpStatus({ matchType: "exact", unitPriceNet: 10 })).toBe(
      "Точное соответствие"
    );
    expect(resolveKpStatus({ matchType: "analog", unitPriceNet: 10 })).toBe(
      "Предложен аналог"
    );
    expect(resolveKpStatus({ matchType: "none", unitPriceNet: 0 })).toBe(
      "Нет в базе"
    );
    expect(resolveKpStatus({ matchType: "exact", unitPriceNet: 0 })).toBe(
      "Цена по запросу"
    );
    expect(
      resolveKpStatus({
        matchType: "exact",
        unitPriceNet: 10,
        unitNeedsRecalc: true,
      })
    ).toBe("Требуется проверка");
    expect(resolveKpStatus({ kpStatus: "Нет в базе" })).toBe("Нет в базе");
  });
});
