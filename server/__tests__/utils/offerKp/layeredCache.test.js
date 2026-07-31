/* eslint-env jest, node */

const {
  buildRetrievalCacheKey,
  buildMatchIdentityCacheKey,
  stripCommercialFields,
  applyCommercialFields,
  getCachedMatchIdentity,
  setCachedMatchIdentity,
  getCachedCommercial,
  setCachedCommercial,
  getCachedRetrieval,
  setCachedRetrieval,
  clearLayeredCaches,
  RETRIEVAL_CACHE_VERSION,
} = require("../../../utils/offerKp/db/layeredCache");
const { clearShopDbCache } = require("../../../utils/offerKp/db/cache");
const {
  buildProductSearchAgentCacheKey,
} = require("../../../utils/offerKp/productSearchAgent");

describe("layered ShopDB cache", () => {
  beforeEach(() => {
    process.env.SHOP_DB_CACHE = "1";
    clearShopDbCache();
    clearLayeredCaches();
  });

  afterEach(() => {
    delete process.env.SHOP_DB_CACHE;
    clearShopDbCache();
    clearLayeredCaches();
  });

  it("builds retrieval keys that differ for Top-50 vs Top-100", () => {
    const base = {
      queryText: "Болт DIN 933 M10x25 8.8",
      indexVersion: "5|19764|e5",
      pipelineVersion: "win100+bm25+dense",
    };
    const top50 = buildRetrievalCacheKey({ ...base, limit: 50 });
    const top100 = buildRetrievalCacheKey({ ...base, limit: 100 });
    expect(top50).not.toBe(top100);
    expect(top50).toContain(":50:");
    expect(top100).toContain(":100:");
    expect(top50.startsWith(`retrieval:v${RETRIEVAL_CACHE_VERSION}:`)).toBe(
      true
    );
  });

  it("invalidates retrieval when indexVersion changes", () => {
    const a = buildRetrievalCacheKey({
      queryText: "винт iso 7380",
      limit: 100,
      indexVersion: "v1",
      pipelineVersion: "win100+bm25+dense",
    });
    const b = buildRetrievalCacheKey({
      queryText: "винт iso 7380",
      limit: 100,
      indexVersion: "v2",
      pipelineVersion: "win100+bm25+dense",
    });
    expect(a).not.toBe(b);
  });

  it("productSearchAgent cache key separates limit 50 from 100", () => {
    const k50 = buildProductSearchAgentCacheKey({
      message: "Болт DIN 933 M10x25",
      limit: 50,
      indexVersion: "idx-a",
      pipelineVersion: "win100+bm25+dense",
    });
    const k100 = buildProductSearchAgentCacheKey({
      message: "Болт DIN 933 M10x25",
      limit: 100,
      indexVersion: "idx-a",
      pipelineVersion: "win100+bm25+dense",
    });
    expect(k50).not.toBe(k100);
    setCachedRetrieval(k50, { products: [{ id: 1 }], strategies: ["test"] });
    expect(getCachedRetrieval(k50)?.products).toEqual([{ id: 1 }]);
    expect(getCachedRetrieval(k100)).toBeUndefined();
  });

  it("strips commercial fields from identity cache entries", () => {
    const line = {
      productId: "42",
      article: "009331100100025",
      matchType: "exact",
      allowPrice: true,
      unitPriceNet: 12.5,
      priceWithVat: 15,
      lineTotal: 125,
      priceSnapshot: 12.5,
      priceSource: "shop_product_skus.price",
      alternatives: [{ id: 1, price: 9.9 }],
      evidence: { shopdb_price: 12.5, selected_sku: "009331100100025" },
    };
    const identity = stripCommercialFields(line);
    expect(identity.unitPriceNet).toBeUndefined();
    expect(identity.priceWithVat).toBeUndefined();
    expect(identity.allowPrice).toBeUndefined();
    expect(identity.productId).toBe("42");
    expect(identity.alternatives[0].price).toBeUndefined();
    expect(identity.evidence.shopdb_price).toBeNull();

    const hydrated = applyCommercialFields(identity, {
      sku: "009331100100025",
      unitPriceNet: 13.1,
      priceWithVat: 15.72,
      priceSource: "live",
      allowPrice: true,
      retrievedAt: "2026-07-30T00:00:00.000Z",
    });
    expect(hydrated.unitPriceNet).toBe(13.1);
    expect(hydrated.allowPrice).toBe(true);
    expect(hydrated.article).toBe("009331100100025");
    expect(hydrated.evidence.shopdb_price).toBe(13.1);
  });

  it("applyCommercialFields does not freeze stale allowPrice=false", () => {
    const hydrated = applyCommercialFields(
      {
        productId: "20073",
        article: "009122000060020",
        matchType: "exact",
        allowPrice: false,
        quantity: 1,
      },
      {
        sku: "009122000060020",
        unitPriceNet: 2.59,
        priceWithVat: 3.11,
        allowPrice: true,
        priceSource: "shop_product_skus.price",
        retrievedAt: "2026-07-31T00:00:00.000Z",
      }
    );
    expect(hydrated.allowPrice).toBe(true);
    expect(hydrated.unitPriceNet).toBe(2.59);
  });

  it("keeps identity and commercial caches separate", () => {
    const key = buildMatchIdentityCacheKey({
      inquiryText: "thread::Болт M10",
      indexVersion: "idx",
      matchingVersion: "deterministic-prod-v1",
    });
    setCachedMatchIdentity(key, {
      productId: "7",
      matchType: "exact",
      allowPrice: true,
      unitPriceNet: 99,
      quantity: 10,
    });
    const identity = getCachedMatchIdentity(key);
    expect(identity.unitPriceNet).toBeUndefined();
    expect(identity.productId).toBe("7");

    setCachedCommercial("7", {
      sku: "SKU7",
      unitPriceNet: 1.5,
      priceWithVat: 1.8,
      allowPrice: true,
    });
    expect(getCachedCommercial("7").unitPriceNet).toBe(1.5);
  });
});
