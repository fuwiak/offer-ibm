"use strict";

const {
  extractPriceAmount,
  extractQuantity,
  findTargetLineIndex,
  looksLikeDraftEdit,
  applyDraftChatEdits,
} = require("../../../utils/offerKp/draftChatEdit");

describe("draftChatEdit", () => {
  const lines = [
    {
      name: "Болт М16x55 ГОСТ 7798-70 кл.8.8 оцинк. М16x55",
      requestedName: "Болт М16x55 ГОСТ 7798-70 кл.8.8 оцинк. М16x55",
      article: "",
      quantity: 1304,
      unitPriceNet: 0,
      matchType: "none",
      status: "Нет в базе",
    },
    {
      name: "Болт М20x90 ГОСТ 7798-70 кл.8.8 оцинк. М20x90",
      requestedName: "Болт М20x90 ГОСТ 7798-70 кл.8.8 оцинк. М20x90",
      article: "",
      quantity: 108,
      unitPriceNet: 0,
      matchType: "none",
      status: "Нет в базе",
    },
    {
      name: "Гайка М24 ГОСТ 52645-2006",
      requestedName: "Гайка М24 ГОСТ 52645-2006 кл.10 оцинк.",
      article: "526450902400000",
      quantity: 72,
      unitPriceNet: 174.46,
      matchType: "exact",
      status: "В наличии",
    },
  ];

  it("extracts price from RU/PL operator phrasing", () => {
    expect(
      extractPriceAmount(
        "cena Болт М20x90 ГОСТ 7798-70 кл.8.8 оцинк. М20x90 jest niepoprawna, w kp wstaw 50 rub"
      )
    ).toBe(50);
    expect(
      extractPriceAmount(
        "цена Болт М20x90 неправильная, в КП вставь 50 руб"
      )
    ).toBe(50);
    expect(
      extractPriceAmount("поставь цену 12.5 для строки 2")
    ).toBe(12.5);
  });

  it("finds target line by product tokens", () => {
    const idx = findTargetLineIndex(
      "цена Болт М20x90 ГОСТ 7798-70 неправильная, вставь 50 руб",
      lines
    );
    expect(idx).toBe(1);
  });

  it("finds target line by row number", () => {
    expect(findTargetLineIndex("поставь цену 10 на строку 3", lines)).toBe(2);
  });

  it("applies operator price override into draft", () => {
    const result = applyDraftChatEdits({
      message:
        "cena Болт М20x90 ГОСТ 7798-70 кл.8.8 оцинк. М20x90 jest niepoprawna, w kp wstaw 50 rub",
      quoteDraft: { hardwareLines: lines, preview: { lines } },
      vatRate: 0.2,
    });
    expect(result.ok).toBe(true);
    expect(result.applied[0].op).toBe("set_price");
    const updated = result.quoteDraft.hardwareLines[1];
    expect(updated.unitPriceNet).toBe(50);
    expect(updated.operatorPriceOverride).toBe(true);
    expect(updated.allowPrice).toBe(true);
    expect(updated.lineTotal).toBe(5400);
  });

  it("applies quantity edit", () => {
    expect(extractQuantity("поставь количество 200 для Болт М16x55")).toBe(200);
    const result = applyDraftChatEdits({
      message: "поставь количество 200 для Болт М16x55",
      quoteDraft: { hardwareLines: lines },
    });
    expect(result.ok).toBe(true);
    expect(result.quoteDraft.hardwareLines[0].quantity).toBe(200);
  });

  it("removes a line", () => {
    const result = applyDraftChatEdits({
      message: "удали строку с Болт М20x90 из КП",
      quoteDraft: { hardwareLines: lines },
    });
    expect(result.ok).toBe(true);
    expect(result.quoteDraft.hardwareLines).toHaveLength(2);
    expect(
      result.quoteDraft.hardwareLines.some((l) => /М20x90/i.test(l.name))
    ).toBe(false);
  });

  it("detects edit intent", () => {
    expect(
      looksLikeDraftEdit("w kp wstaw 50 rub для Болт М20x90")
    ).toBe(true);
    expect(looksLikeDraftEdit("сколько позиций в каталоге?")).toBe(false);
  });

  it("recognizes UI button label «Дешёвые аналоги» as draft command", () => {
    expect(looksLikeDraftEdit("Дешёвые аналоги")).toBe(true);
    expect(looksLikeDraftEdit("Najtańsze analogi")).toBe(true);
    expect(looksLikeDraftEdit("Cheapest analogs")).toBe(true);
    expect(looksLikeDraftEdit("подставь дешёвые аналоги")).toBe(true);

    const linesWithAlts = [
      {
        name: "Болт М16",
        article: "OLD",
        quantity: 10,
        unitPriceNet: 40,
        alternatives: [
          { sku: "OLD", name: "Болт М16 old", price: 40, matchType: "exact", stockCount: 0 },
          {
            sku: "CHEAP",
            name: "Болт М16 cheap",
            price: 15,
            matchType: "exact",
            stockCount: 20,
          },
        ],
      },
      {
        name: "Гайка",
        article: "KEEP",
        quantity: 5,
        unitPriceNet: 8,
        alternatives: [
          { sku: "KEEP", name: "Гайка keep", price: 8, matchType: "exact", stockCount: 5 },
          {
            sku: "CHEAPER",
            name: "Гайка cheaper",
            price: 5,
            matchType: "analog",
            stockCount: 9,
          },
        ],
      },
    ];

    const result = applyDraftChatEdits({
      message: "Дешёвые аналоги",
      quoteDraft: { hardwareLines: linesWithAlts, preview: { lines: linesWithAlts } },
      vatRate: 0.2,
    });
    expect(result.ok).toBe(true);
    expect(result.applied.every((a) => a.op === "cheapest_analog")).toBe(true);
    expect(result.quoteDraft.hardwareLines[0].article).toBe("CHEAP");
    expect(result.quoteDraft.hardwareLines[0].unitPriceNet).toBe(15);
    expect(result.quoteDraft.hardwareLines[1].article).toBe("CHEAPER");
    expect(result.quoteDraft.hardwareLines[1].unitPriceNet).toBe(5);
  });

  it("replies when cheapest-analogs button finds nothing", () => {
    const result = applyDraftChatEdits({
      message: "Дешёвые аналоги",
      quoteDraft: {
        hardwareLines: [
          { name: "X", article: "A", alternatives: [{ sku: "A", price: 1, stockCount: 1 }] },
        ],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("cheapest_analogs_empty");
    expect(result.reply).toMatch(/Нет строк/);
  });
});
