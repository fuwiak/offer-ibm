/* eslint-env jest, node */

const { AgentHarness } = require("../../../utils/agentHarness/AgentHarness");

/**
 * Финальный текст агента в чат не должен содержать выдуманных цен —
 * та же политика ShopDB-only, что и для create-docx/pdf.
 * Кейс из прод-бага: модель выдала таблицу «Штанга DIN 975 … 18.50»
 * вместо 20 болтов из PDF-заявки.
 */
describe("AgentHarness.sanitizeOutgoingChat", () => {
  const draft = {
    reference: "KP-TEST",
    lines: [
      {
        requestedName: "Болт M10x100 ГОСТ 7805-70 с гайкой",
        name: "Болт DIN 931 M10x100",
        quantity: 30,
        unit: "кг",
        unitPriceNet: 45.0,
        matchType: "exact",
        kpStatus: "Требуется проверка",
        unitNeedsRecalc: true,
      },
      {
        requestedName: "Болт M6x25 ГОСТ 7805-70",
        name: "Болт M6x25",
        quantity: 3,
        unit: "кг",
        unitPriceNet: 0,
        matchType: "none",
        kpStatus: "Нет в базе",
      },
    ],
  };

  const inventedTable = [
    "Вот коммерческое предложение:",
    "",
    "| Позиция | Кол-во | Цена | Сумма |",
    "|---------|--------|------|-------|",
    "| Штанга DIN 975 M36×2000 4.8 оцинк | 1 | 18.50 RUB | 18.50 RUB |",
    "| Болт DIN 931 M10×50 8.8 оцинк | 10 | 33.04 RUB | 330.40 RUB |",
    "| Гайка DIN 934 M10 8 оцинк | 10 | 21.27 RUB | 212.70 RUB |",
    "",
    "**Итого без НДС:** 561.60 RUB",
  ].join("\n");

  function harnessWith(stateEntries = {}) {
    const harness = new AgentHarness({ aibitat: {}, ctx: {} });
    for (const [k, v] of Object.entries(stateEntries)) {
      harness.state.set(k, v);
    }
    return harness;
  }

  it("заменяет выдуманную таблицу на детерминированный КП из черновика", () => {
    const harness = harnessWith({ inquiryDbDraft: draft });
    const out = harness.sanitizeOutgoingChat(inventedTable);

    // Ни одной выдуманной цены не осталось.
    expect(out).not.toContain("18.50");
    expect(out).not.toContain("33.04");
    expect(out).not.toContain("21.27");
    expect(out).not.toContain("Штанга DIN 975");
    // Вместо неё — строки заявки со статусами регламента.
    expect(out).toContain("Болт M10x100");
    expect(out).toContain("Нет в базе");
    expect(out).toContain("Точный товар отсутствует. Подходящий аналог не найден");
    expect(out).toContain("Требуется уточнение пересчёта единиц измерения");
  });

  it("не трогает ответ, когда цены совпадают с черновиком ShopDB", () => {
    const harness = harnessWith({ inquiryDbDraft: draft });
    const legit = [
      "| Позиция | Кол-во | Цена | Сумма |",
      "|---|---|---|---|",
      "| Болт DIN 931 M10x100 | 30 | 45.00 | — |",
    ].join("\n");
    expect(harness.sanitizeOutgoingChat(legit)).toBe(legit);
  });

  it("без черновика переписывает выдуманные цены в «под заказ»", () => {
    const harness = harnessWith({});
    const out = harness.sanitizeOutgoingChat(inventedTable);
    expect(out).toContain("под заказ");
    expect(out).not.toMatch(/\|\s*18\.50 RUB\s*\|/);
  });

  it("обычный текст без таблиц проходит без изменений", () => {
    const harness = harnessWith({ inquiryDbDraft: draft });
    const text = "Здравствуйте! Чем могу помочь?";
    expect(harness.sanitizeOutgoingChat(text)).toBe(text);
  });

  /**
   * Прод-баг: на мета-вопрос без вложенного PDF и без реального поиска
   * модель ответила бюллет-списком «[Каталог · purolat.com] / Цена: … /
   * Артикул / SKU: …» — тот же формат, что учит prompts.js, но с полностью
   * выдуманными данными. Раньше проверка цен работала только для markdown
   * таблиц (`text.includes("|")`), поэтому такой ответ проходил без правок.
   */
  it("абстинирует выдуманный bullet-блок каталога без markdown-таблицы", () => {
    const harness = harnessWith({});
    const fabricated = [
      "[Каталог · purolat.com]",
      "Товар: Штанга DIN 975 M36×2000 4.8 оцинк",
      "Цена: 1250.00 RUB",
      "Артикул / SKU: 975M362000Z",
      "Категория: Штанги и профили",
      "Ссылка: https://purolat.com/product/975M362000Z",
    ].join("\n");

    const out = harness.sanitizeOutgoingChat(fabricated);
    expect(out).not.toContain("1250.00");
    expect(out).not.toContain("975M362000Z");
    expect(out).not.toContain("Штанга DIN 975");
  });

  it("пропускает bullet-ответ, если цена реально подставлена сервером", () => {
    const catalogBlock =
      "[Каталог · purolat.com] Штанга DIN 975 M36×2000 4.8 оцинк\n" +
      "ID товара (shop_product.id): 1\nЦена: 1250.00 RUB\nСсылка: https://purolat.com/product/975M362000Z";
    const harness = harnessWith({});
    harness.aibitat._chats = [
      { from: "USER", content: `${catalogBlock}\n\nкакая цена?` },
    ];

    const legitReply = [
      "**Товар:** Штанга DIN 975 M36×2000 4.8 оцинк",
      "**Цена:** 1250.00 RUB",
      "**Ссылка:** https://purolat.com/product/975M362000Z",
    ].join("\n");

    expect(harness.sanitizeOutgoingChat(legitReply)).toBe(legitReply);
  });
});
