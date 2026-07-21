/* eslint-env jest, node */

const {
  mergeCatalogIntoUserPrompt,
  hasCatalogBlocks,
  isCatalogBlock,
  applyExternalContextsForLlm,
  applyInquiryDraftToUserPrompt,
  enrichUserPromptWithShopCatalog,
  extractCatalogBlocksFromText,
  extractCatalogBlocksFromChatHistory,
} = require("../../../utils/offerKp/catalogPrompt");
const matchInquiryLines = require("../../../utils/offerKp/matchInquiryLines");
const enrich = require("../../../utils/offerKp/enrich");

describe("catalogPrompt", () => {
  const sampleBlock = `[Каталог · purolat.com] Сталь шпоночная ГОСТ 8787-68 30x30x1000
Цена: 3713.92 RUB
Ссылка: https://purolat.com/example/`;

  it("detects catalog blocks", () => {
    expect(isCatalogBlock(sampleBlock)).toBe(true);
    expect(hasCatalogBlocks([sampleBlock])).toBe(true);
    expect(hasCatalogBlocks(["random text"])).toBe(false);
  });

  it("merges catalog into user prompt with visible headers", () => {
    const merged = mergeCatalogIntoUserPrompt("какая цена?", [sampleBlock]);
    expect(merged).toContain("=== ДАННЫЕ КАТАЛОГА PUROLAT.COM");
    expect(merged).toContain("[Каталог · purolat.com]");
    expect(merged).toContain("3713.92 RUB");
    expect(merged).toContain("какая цена?");
  });

  it("returns user prompt unchanged when no catalog blocks", () => {
    expect(mergeCatalogIntoUserPrompt("какая цена?", [])).toBe("какая цена?");
  });

  it("puts catalog only in user prompt via applyExternalContextsForLlm", () => {
    const result = applyExternalContextsForLlm("цена", [
      {
        kind: "shopdb",
        contextTexts: [sampleBlock],
        sources: [{ id: "1" }],
        flags: { shopDbDocCount: 1 },
      },
    ]);
    expect(result.catalogInjected).toBe(true);
    expect(result.userPrompt).toContain("=== ДАННЫЕ КАТАЛОГА");
    expect(result.contextTexts).toEqual([]);
    expect(result.sources).toHaveLength(1);
  });

  it("drops supplied ShopDB context for a casual message", () => {
    const result = applyExternalContextsForLlm("hello", [
      {
        kind: "shopdb",
        contextTexts: [sampleBlock],
        sources: [{ id: "1" }],
        flags: { shopDbDocCount: 1 },
      },
    ]);

    expect(result.userPrompt).toBe("hello");
    expect(result.catalogInjected).toBe(false);
    expect(result.contextTexts).toEqual([]);
    expect(result.sources).toEqual([]);
  });

  it("extracts catalog blocks from prior chat history", () => {
    const priorPrompt = mergeCatalogIntoUserPrompt("какая цена?", [
      sampleBlock,
    ]);
    const blocks = extractCatalogBlocksFromChatHistory([
      { role: "user", content: priorPrompt },
      { role: "assistant", content: "Цена указана выше." },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("3713.92 RUB");
  });

  it("extracts standalone catalog blocks from text", () => {
    const blocks = extractCatalogBlocksFromText(sampleBlock);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("[Каталог · purolat.com]");
  });

  it("does not reuse catalog history for a casual message", async () => {
    jest.spyOn(enrich, "shopDbEnrichEnabled").mockReturnValue(true);
    jest.spyOn(enrich, "shouldRunShopEnrich").mockReturnValue(false);
    const getContext = jest
      .spyOn(enrich, "getShopDbContext")
      .mockResolvedValue({ contextTexts: [sampleBlock] });

    await expect(
      enrichUserPromptWithShopCatalog("hello", {
        parsedFileTexts: ["Штанга DIN 975 M36x2000, 10 шт"],
        chatHistory: [{ role: "user", content: sampleBlock }],
      })
    ).resolves.toBe("hello");
    expect(getContext).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it("injects inquiry draft with ShopDB prices when PDF text is present", async () => {
    jest.spyOn(matchInquiryLines, "matchInquiryToDraft").mockResolvedValue({
      lines: [
        {
          requestedName: "Болт M10x100",
          name: "Болт DIN 931 M10x100",
          quantity: 30,
          unit: "кг",
          unitPriceNet: 19.69,
          status: "in_stock",
          productId: "123",
        },
      ],
    });

    const catalogPrompt = mergeCatalogIntoUserPrompt("сделай КП", [
      sampleBlock,
    ]);
    const merged = await applyInquiryDraftToUserPrompt(catalogPrompt, {
      message: "сделай КП",
      parsedFileTexts: ["Болт M10x100 ГОСТ 7805-70 | 30 | кг"],
    });

    expect(merged).toContain("ЧЕРНОВИК КП ПО ЗАЯВКЕ");
    expect(merged).toContain("19.69 RUB");
    expect(merged).toContain("Запрещено брать цены из PDF");

    matchInquiryLines.matchInquiryToDraft.mockRestore();
  });
});
