/* eslint-env jest, node */

const {
  shopDbCacheEnabled,
  isCacheableQuery,
  makeCacheKey,
  getCachedQuery,
  setCachedQuery,
  getCachedAgentResult,
  setCachedAgentResult,
  clearShopDbCache,
  getShopDbCacheStats,
} = require("../../../utils/offerKp/db/cache");

describe("shopDb cache", () => {
  beforeEach(() => {
    clearShopDbCache();
    process.env.SHOP_DB_CACHE = "1";
  });

  afterEach(() => {
    delete process.env.SHOP_DB_CACHE;
    clearShopDbCache();
  });

  it("caches SELECT query results by sql+params", () => {
    const sql = "SELECT id, name FROM shop_product WHERE id = ?";
    const params = [42];
    const rows = [{ id: 42, name: "Bolt" }];

    expect(getCachedQuery(sql, params)).toBeUndefined();
    setCachedQuery(sql, params, rows);
    expect(getCachedQuery(sql, params)).toEqual(rows);
  });

  it("does not cache identical queries with different params", () => {
    const sql = "SELECT id FROM shop_product WHERE id = ?";
    setCachedQuery(sql, [1], [{ id: 1 }]);
    setCachedQuery(sql, [2], [{ id: 2 }]);
    expect(getCachedQuery(sql, [1])).toEqual([{ id: 1 }]);
    expect(getCachedQuery(sql, [2])).toEqual([{ id: 2 }]);
  });

  it("ignores non-SELECT queries", () => {
    expect(isCacheableQuery("UPDATE shop_product SET name = ?")).toBe(false);
    setCachedQuery("UPDATE shop_product SET name = ?", ["x"], [{ ok: 1 }]);
    expect(getCachedQuery("UPDATE shop_product SET name = ?", ["x"])).toBeUndefined();
  });

  it("ignores ping queries", () => {
    expect(isCacheableQuery("SELECT 1 AS ok")).toBe(false);
  });

  it("caches product search agent results", () => {
    const key = makeCacheKey("productSearchAgent", ["DIN 933 M8", 10, "DIN 933 M8", ""]);
    const result = { products: [{ id: 1 }], strategies: ["keywords"] };

    setCachedAgentResult(key, result);
    expect(getCachedAgentResult(key)).toEqual(result);
  });

  it("can be disabled via SHOP_DB_CACHE=0", () => {
    process.env.SHOP_DB_CACHE = "0";
    expect(shopDbCacheEnabled()).toBe(false);
    setCachedQuery("SELECT id FROM shop_product", [], [{ id: 1 }]);
    expect(getCachedQuery("SELECT id FROM shop_product", [])).toBeUndefined();
  });

  it("tracks cache stats", () => {
    const sql = "SELECT id FROM shop_product WHERE id = ?";
    setCachedQuery(sql, [1], [{ id: 1 }]);
    getCachedQuery(sql, [1]);
    getCachedQuery(sql, [2]);

    const stats = getShopDbCacheStats();
    expect(stats.query.hits).toBe(1);
    expect(stats.query.misses).toBe(1);
    expect(stats.query.size).toBe(1);
  });
});
