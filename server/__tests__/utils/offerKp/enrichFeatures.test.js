"use strict";

jest.mock("../../../utils/offerKp/db/client", () => ({
  query: jest.fn(),
  isShopDbConfigured: jest.fn(() => true),
  getShopDbTarget: jest.fn(() => ({ configured: true })),
  formatShopDbConnectionHint: jest.fn(() => ""),
}));

const db = require("../../../utils/offerKp/db/client");
const { loadFeatureLines } = require("../../../utils/offerKp/enrich");

describe("ShopDB feature enrichment", () => {
  it("loads varchar and dimension values with units", async () => {
    db.query.mockResolvedValue([
      { product_id: 10, feature_name: "Диаметр", feature_value: "10 mm" },
      {
        product_id: 10,
        feature_name: "DIN/ГОСТ/ISO",
        feature_value: "DIN 933",
      },
    ]);

    const result = await loadFeatureLines([10]);
    const sql = db.query.mock.calls[0][0];

    expect(sql).toContain("shop_feature_values_varchar");
    expect(sql).toContain("shop_feature_values_dimension");
    expect(sql).toContain("f.type LIKE 'dimension.%'");
    expect(sql).not.toMatch(/\bLIMIT\s+200\b/i);
    expect(result.get(10)).toEqual(["Диаметр: 10 mm", "DIN/ГОСТ/ISO: DIN 933"]);
  });
});
