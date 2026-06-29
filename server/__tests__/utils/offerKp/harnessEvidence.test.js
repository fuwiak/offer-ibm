const {
  parseCatalogEvidence,
  gradeCatalogEvidence,
  validateQuotePricesAgainstCatalog,
  shouldAbstainFromEvidence,
} = require("../../../utils/offerKp/harnessEvidence");

const SAMPLE_BLOCK = `[Каталог · purolat.com] Болт DIN 931 M12
ID товара (shop_product.id): 101
Цена: 21.27 RUB
SKU (shop_product_skus):
  · DIN931-M12 — 21.27 RUB, остаток: 50`;

describe("harnessEvidence", () => {
  it("parses catalog prices and SKUs", () => {
    const entries = parseCatalogEvidence([SAMPLE_BLOCK]);
    expect(entries).toHaveLength(1);
    expect(entries[0].prices).toContain(21.27);
    expect(entries[0].productId).toBe("101");
  });

  it("grades strong evidence when priced blocks exist", () => {
    const grade = gradeCatalogEvidence([SAMPLE_BLOCK], {
      question: "болт DIN 931 M12",
    });
    expect(grade.grade).toBeGreaterThanOrEqual(0.5);
    expect(grade.pricedBlocks).toBe(1);
  });

  it("abstains on empty catalog", () => {
    const grade = gradeCatalogEvidence([]);
    expect(grade.grade).toBe(0);
    expect(shouldAbstainFromEvidence(grade)).toBe(true);
  });

  it("rejects quote prices not in catalog (weakest-claim gate)", () => {
    const content =
      "| Позиция | Кол-во | Цена | Сумма |\n| Болт | 10 | 99.99 | 999.90 |";
    const result = validateQuotePricesAgainstCatalog(content, [SAMPLE_BLOCK]);
    expect(result.ok).toBe(false);
    expect(result.violations[0].id).toBe("catalog-price-mismatch");
  });

  it("accepts quote prices matching catalog", () => {
    const content =
      "| Позиция | Кол-во | Цена | Сумма |\n| Болт | 10 | 21.27 | 212.70 |";
    const result = validateQuotePricesAgainstCatalog(content, [SAMPLE_BLOCK]);
    expect(result.ok).toBe(true);
  });
});
