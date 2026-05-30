/* eslint-env jest, node */

const {
  mergeCatalogIntoUserPrompt,
  hasCatalogBlocks,
  isCatalogBlock,
} = require("../../../utils/offerKp/catalogPrompt");

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
});
