"use strict";

const {
  isPricedAcceptedLine,
  extractChatTableRows,
  compareDraftToChat,
  mergeKeepGoodPadMissing,
  reproduceDraftFillMissing,
  alignChatTextWithDraftMarkdown,
  applyCatalogEvidenceToLine,
} = require("../../../utils/offerKp/draftChatReconcile");

describe("draftChatReconcile", () => {
  const priced = (i, price) => ({
    requestedName: `Винт M${i}`,
    inquiryRaw: `Винт M${i}`,
    name: `Винт M${i} catalog`,
    article: `SKU-${i}`,
    productId: String(100 + i),
    quantity: 10,
    unit: "шт",
    unitPriceNet: price,
    priceWithVat: price * 1.2,
    lineTotal: price * 10,
    matchType: "exact",
    kpStatus: "Точное соответствие",
  });

  const stub = (i) => ({
    requestedName: `Винт M${i}`,
    inquiryRaw: `Винт M${i}`,
    name: `Винт M${i}`,
    article: "",
    productId: "",
    quantity: 10,
    unitPriceNet: 0,
    matchType: "none",
    kpStatus: "Нет в базе",
  });

  it("detects priced accepted lines", () => {
    expect(isPricedAcceptedLine(priced(5, 12.5))).toBe(true);
    expect(isPricedAcceptedLine(stub(5))).toBe(false);
    expect(
      isPricedAcceptedLine({ ...priced(5, 12.5), matchType: "similar" })
    ).toBe(false);
  });

  it("extracts chat markdown table prices", () => {
    const chat = `
| # | Заявка | Предложено | Артикул | Статус | Ед. | Кол-во | Цена | Сумма | Комментарий |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Винт M5 | Винт M5 cat | SKU-5 | Точное соответствие | шт | 500 | 3.50 | 1750 | — |
| 2 | Винт M6 | Нет в базе | — | Нет в базе | шт | 100 | — | — | — |
`;
    const rows = extractChatTableRows(chat);
    expect(rows).toHaveLength(2);
    expect(rows[0].unitPriceNet).toBe(3.5);
    expect(rows[0].article).toBe("SKU-5");
    expect(rows[1].unitPriceNet).toBeNull();
  });

  it("compareDraftToChat flags missing priced slots", () => {
    const inquiryText = [
      "Винт M5х16-А4 DIN 7991 – 500 шт.",
      "Винт M6х35-А4 DIN 7991 – 500 шт.",
    ].join("\n");
    const draft = { lines: [priced(5, 3.5)] };
    const catalogBlocks = [
      `[Каталог · purolat.com] Винт M6х35-А4 DIN 7991
ID товара (shop_product.id): 206
Цена: 4.20 RUB
Ссылка: https://purolat.com/p/206`,
    ];
    const comparison = compareDraftToChat({
      draft,
      inquiryText,
      catalogBlocks,
      chatText: "",
    });
    expect(comparison.expectedLineCount).toBe(2);
    expect(comparison.missingIndexes).toContain(1);
    expect(comparison.needsReproduce).toBe(true);
  });

  it("mergeKeepGoodPadMissing keeps priced lines instead of wipe", () => {
    const inquiryLines = [
      { raw: "a", name: "Винт M5", quantity: 1, unit: "шт" },
      { raw: "b", name: "Винт M6", quantity: 2, unit: "шт" },
      { raw: "c", name: "Винт M8", quantity: 3, unit: "шт" },
    ];
    const draft = { lines: [priced(5, 3.5)] };
    const merged = mergeKeepGoodPadMissing({ draft, inquiryLines });
    expect(merged.lines).toHaveLength(3);
    expect(isPricedAcceptedLine(merged.lines[0])).toBe(true);
    expect(merged.lines[0].unitPriceNet).toBe(3.5);
    expect(merged.lines[1].matchType).toBe("none");
  });

  it("reproduceDraftFillMissing rematches only gaps", async () => {
    const inquiryText = [
      "Винт M5х16 – 10 шт.",
      "Винт M6х20 – 10 шт.",
      "Винт M8х25 – 10 шт.",
    ].join("\n");
    const draft = {
      lines: [priced(5, 1.1), stub(6), priced(8, 2.2)],
    };
    const calls = [];
    const matchLine = async (line) => {
      calls.push(line.name || line.raw);
      return priced(6, 9.9);
    };
    const result = await reproduceDraftFillMissing({
      draft,
      inquiryText,
      matchLine,
    });
    expect(result.kept).toBe(2);
    expect(result.rematched).toBe(1);
    expect(calls).toHaveLength(1);
    expect(result.draft.lines[0].unitPriceNet).toBe(1.1);
    expect(result.draft.lines[1].unitPriceNet).toBe(9.9);
    expect(result.draft.lines[2].unitPriceNet).toBe(2.2);
  });

  it("applyCatalogEvidenceToLine fills from ShopDB block only", () => {
    const line = stub(6);
    line.requestedName = "Винт M6х35-А4 DIN 7991";
    const filled = applyCatalogEvidenceToLine(line, [
      {
        name: "Винт M6х35-А4 DIN 7991 Zn",
        productId: "206",
        unitPriceNet: 4.2,
        productUrl: "https://purolat.com/p/206",
      },
    ]);
    expect(isPricedAcceptedLine(filled)).toBe(true);
    expect(filled.unitPriceNet).toBe(4.2);
    expect(filled.productId).toBe("206");
  });

  it("extracts Товар/Цена/Артикул chat cards", () => {
    const chat = `
[Каталог · purolat.com]
Товар: Винт ГОСТ ISO 7380-1-М10×25-8.8
Цена: 12.50 RUB
Артикул / SKU: 45104992510700
Ссылка: https://purolat.com/product/45104992510700

Товар: Винт М5×16-А4 DIN 7991
Цена: 8.50 RUB
Артикул / SKU: 45104992511500
`;
    const {
      extractChatProductBlocks,
      namesCompatible,
    } = require("../../../utils/offerKp/draftChatReconcile");
    const rows = extractChatProductBlocks(chat);
    expect(rows).toHaveLength(2);
    expect(rows[0].article).toBe("45104992510700");
    expect(rows[0].unitPriceNet).toBe(12.5);
    expect(rows[1].name).toMatch(/М5|M5/);
    expect(
      namesCompatible(
        "Винт ГОСТ ISO 7380-1-М10х25-8.8",
        "Винт ГОСТ ISO 7380-1-М10×25-8.8"
      )
    ).toBe(true);
    expect(
      namesCompatible(
        "Винт ГОСТ ISO 7380-1-М10х25-8.8",
        "Винт М6-6g×12 DIN 7380-1"
      )
    ).toBe(false);
  });

  it("fills gap from chat SKU only after ShopDB verify + name check", async () => {
    const inquiryText = [
      "Винт ГОСТ ISO 7380-1-М10х25-8.8 – 1700 шт.",
      "Винт М5х16-А4 DIN 7991 – 500 шт.",
    ].join("\n");
    const chatText = `
Товар: Винт ГОСТ ISO 7380-1-М10×25-8.8
Цена: 99.00 RUB
Артикул / SKU: SKU-M10
Товар: Винт М5×16-А4 DIN 7991
Цена: 88.00 RUB
Артикул / SKU: SKU-M5
`;
    const searchByExactSku = jest.fn(async (skus) => {
      const sku = skus[0];
      if (sku === "SKU-M10") {
        return [{ id: 1, name: "Винт ГОСТ ISO 7380-1-М10×25-8.8", price: 12.5 }];
      }
      if (sku === "SKU-M5") {
        return [{ id: 2, name: "Винт М5×16-А4 DIN 7991", price: 8.5 }];
      }
      return [];
    });
    const matchLine = jest.fn(async () => {
      throw new Error("should not rematch when chat SKU works");
    });
    const result = await reproduceDraftFillMissing({
      draft: { lines: [] },
      inquiryText,
      matchLine,
      searchByExactSku,
      options: { chatText },
    });
    expect(result.fromChatSku).toBe(2);
    expect(result.rematched).toBe(0);
    expect(result.draft.lines).toHaveLength(2);
    // Live ShopDB price, not LLM 99.00
    expect(result.draft.lines[0].unitPriceNet).toBe(12.5);
    expect(result.draft.lines[1].unitPriceNet).toBe(8.5);
    expect(matchLine).not.toHaveBeenCalled();
  });

  it("buildDraftFromChatProductCards creates one line per Товар card", async () => {
    const {
      buildDraftFromChatProductCards,
      extractChatProductBlocks,
    } = require("../../../utils/offerKp/draftChatReconcile");
    const chatText = `
Товар: Винт ГОСТ ISO 7380-1-М10×25-8.8
Цена: 12.50 RUB
Артикул / SKU: SKU-A
Товар: Винт ГОСТ ISO 7380-1-М8×70-8.8
Цена: 14.75 RUB
Артикул / SKU: SKU-B
Товар: Винт М5×16-А4 DIN 7991
Цена: 8.50 RUB
Артикул / SKU: SKU-C
`;
    expect(extractChatProductBlocks(chatText)).toHaveLength(3);
    const searchByExactSku = jest.fn(async (skus) => {
      const sku = skus[0];
      const map = {
        "SKU-A": {
          id: 1,
          name: "Винт ГОСТ ISO 7380-1-М10×25-8.8",
          price: 12.5,
        },
        "SKU-B": {
          id: 2,
          name: "Винт ГОСТ ISO 7380-1-М8×70-8.8",
          price: 14.75,
        },
        "SKU-C": { id: 3, name: "Винт М5×16-А4 DIN 7991", price: 8.5 },
      };
      return map[sku] ? [map[sku]] : [];
    });
    const matchLine = jest.fn(async () => {
      throw new Error("should use chat SKU path");
    });
    const result = await buildDraftFromChatProductCards({
      chatText,
      inquiryText: [
        "Винт ГОСТ ISO 7380-1-М10х25-8.8 – 1700 шт.",
        "Винт ГОСТ ISO 7380-1-М8х70-8.8 – 400 шт.",
        "Винт М5х16-А4 DIN 7991 – 500 шт.",
      ].join("\n"),
      searchByExactSku,
      matchLine,
    });
    expect(result.fromChatCards).toBe(3);
    expect(result.fromChatSku).toBe(3);
    expect(result.draft.lines).toHaveLength(3);
    expect(result.draft.lines.map((l) => l.quantity)).toEqual([1700, 400, 500]);
    expect(result.draft.lines[0].unitPriceNet).toBe(12.5);
    expect(matchLine).not.toHaveBeenCalled();
  });
});
