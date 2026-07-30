"use strict";

const {
  isPricedAcceptedLine,
  compareDraftToInquiry,
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

  it("compareDraftToInquiry flags missing priced slots", () => {
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
    const comparison = compareDraftToInquiry({
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

  it("ignores generated chat SKU and price when rebuilding a draft", async () => {
    const matchLine = jest.fn(async () => priced(10, 12.5));
    const searchByExactSku = jest.fn(async () => [
      { id: 999, sku: "FAKE", price: 999 },
    ]);
    const result = await reproduceDraftFillMissing({
      draft: { lines: [] },
      inquiryText: "Винт ISO 7380 M10x25 – 10 шт.",
      matchLine,
      searchByExactSku,
      options: {
        chatText: "Товар: Поддельный\nЦена: 999 RUB\nАртикул / SKU: FAKE",
      },
    });

    expect(matchLine).toHaveBeenCalledTimes(1);
    expect(searchByExactSku).not.toHaveBeenCalled();
    expect(result.fromChatSku).toBe(0);
    expect(result.fromChatCards).toBe(0);
    expect(result.draft.lines[0].unitPriceNet).toBe(12.5);
    expect(result.draft.lines[0].article).toBe("SKU-10");
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
});
