/* eslint-env jest, node */

const {
  TABLES,
  ENRICH_TABLES,
  PRODUCT_COLUMNS,
  SCHEMA_REQUIREMENTS,
  LLM_CONTEXT_MARKERS,
} = require("../../../utils/offerKp/db/schema");

describe("offerKp shop DB schema map", () => {
  it("lists all enrich tables including price and SKU", () => {
    expect(ENRICH_TABLES).toContain(TABLES.product);
    expect(ENRICH_TABLES).toContain(TABLES.productSkus);
    expect(ENRICH_TABLES).toContain(TABLES.searchIndex);
  });

  it("requires price and currency on shop_product for LLM excerpts", () => {
    const cols = SCHEMA_REQUIREMENTS[TABLES.product];
    expect(cols).toContain(PRODUCT_COLUMNS.price);
    expect(cols).toContain(PRODUCT_COLUMNS.currency);
    expect(cols).toContain(PRODUCT_COLUMNS.name);
  });

  it("requires SKU price columns for variant pricing", () => {
    const skuCols = SCHEMA_REQUIREMENTS[TABLES.productSkus];
    expect(skuCols).toContain("price");
    expect(skuCols).toContain("compare_price");
  });

  it("defines LLM context markers used in enrich blocks", () => {
    expect(LLM_CONTEXT_MARKERS.catalogPrefix).toBe("[Каталог ·");
    expect(LLM_CONTEXT_MARKERS.priceLabel).toBe("Цена:");
  });
});
