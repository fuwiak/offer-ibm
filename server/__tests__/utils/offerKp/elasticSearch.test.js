/* eslint-env jest, node */

jest.mock("../../../utils/offerKp/db/client", () => ({
  query: jest.fn(),
}));

const { query } = require("../../../utils/offerKp/db/client");
const {
  resetAllCircuitBreakers,
} = require("../../../utils/offerKp/connectors/resilientCall");
const {
  elasticEnabled,
  elasticIndexName,
  buildElasticQuery,
  searchElasticProductIds,
  hydrateElasticHitsFromShopDb,
  searchProductsViaElastic,
} = require("../../../utils/offerKp/connectors/elasticSearch");
const {
  buildElasticDocument,
} = require("../../../utils/offerKp/connectors/elasticSync");

const ORIGINAL_FETCH = global.fetch;

function mockEsHits(ids) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      hits: { hits: ids.map((id) => ({ _id: String(id) })) },
    }),
  });
}

describe("elasticSearch connector", () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
    query.mockReset();
    delete process.env.OFFER_KP_ELASTICSEARCH;
    delete process.env.OFFER_KP_ES_INDEX;
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it("is disabled by default", async () => {
    expect(elasticEnabled()).toBe(false);
    expect(await searchElasticProductIds(["болт"], {}, 10)).toBeNull();
    expect(await searchProductsViaElastic(["болт"], {}, 10)).toBeNull();
  });

  it("builds a hybrid query with BM25 + signature boosts", () => {
    const body = buildElasticQuery(
      ["болт", "din", "933"],
      {
        dinNumbers: ["933"],
        thread: { size: "10", length: "50" },
      },
      20
    );
    expect(body.size).toBe(20);
    expect(body._source).toBe(false);
    const should = body.query.bool.should;
    expect(should.some((c) => c.multi_match)).toBe(true);
    expect(
      should.some((c) => c.match_phrase?.standard?.query === "DIN 933")
    ).toBe(true);
    expect(should.some((c) => c.term?.diameter?.value === 10)).toBe(true);
    expect(should.some((c) => c.term?.length?.value === 50)).toBe(true);
  });

  it("builds a precise DIN+MxL filter query (no BM25 should-clause)", () => {
    const {
      buildPreciseElasticQuery,
    } = require("../../../utils/offerKp/connectors/elasticSearch");
    const body = buildPreciseElasticQuery(
      { dinNumbers: ["912"], thread: { size: "10", length: "25" } },
      20
    );
    expect(body.query.bool.filter.length).toBeGreaterThanOrEqual(3);
    expect(body.query.bool.should).toBeUndefined();
  });

  it("precise ES filter ORs all dinNumbers (GOST 7805 + DIN 933)", () => {
    const {
      buildPreciseElasticQuery,
    } = require("../../../utils/offerKp/connectors/elasticSearch");
    const body = buildPreciseElasticQuery(
      { dinNumbers: ["7805", "933"], thread: { size: "12", length: "40" } },
      20
    );
    const dinFilter = body.query.bool.filter.find((c) => c.bool?.should);
    const phrases = dinFilter.bool.should.map(
      (c) => c.match_phrase?.standard || c.match_phrase?.name
    );
    expect(phrases).toEqual(
      expect.arrayContaining(["DIN 7805", "DIN 933", "7805", "933"])
    );
  });

  it("returns ES ids and hydrates live rows from ShopDB in ES order", async () => {
    process.env.OFFER_KP_ELASTICSEARCH = "1";
    mockEsHits([15231, 999, 42]);
    // ShopDB returns rows unordered; hydrate must restore ES ranking.
    query.mockResolvedValue([
      { id: 42, name: "Болт Б", price: 2 },
      { id: 15231, name: "Болт А", price: 1 },
    ]);
    const rows = await searchProductsViaElastic(["болт"], {}, 10);
    expect(rows.map((r) => r.id)).toEqual([15231, 42]);
    expect(rows[0].shopMatchSources).toEqual(["elastic"]);
    // Live hydrate: price came from the SQL row, not the ES doc.
    expect(rows[0].price).toBe(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/IN \(\?, \?, \?\)/);
    expect(params).toEqual(["15231", "999", "42"]);
  });

  it("falls back to null when ES is down (caller uses SQL fan-out)", async () => {
    process.env.OFFER_KP_ELASTICSEARCH = "1";
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await searchProductsViaElastic(["болт"], {}, 10);
    expect(result).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("hydrate with no ids is a no-op", async () => {
    expect(await hydrateElasticHitsFromShopDb([])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("index name is versioned and overridable", () => {
    expect(elasticIndexName()).toBe("offerkp-products-v1");
    process.env.OFFER_KP_ES_INDEX = "custom-index";
    expect(elasticIndexName()).toBe("custom-index");
  });
});

describe("elasticSync document builder", () => {
  it("extracts the search signature and never carries price/stock", () => {
    const doc = buildElasticDocument({
      id: 15231,
      name: "Болт DIN 933 M10x50",
      summary: "s",
      description: "<p>desc</p>",
      category_name: "Болты",
      sku: "933-M10X50",
      price: 123.45,
      count: 7,
    });
    expect(doc.standard).toBe("DIN 933");
    expect(doc.diameter).toBe(10);
    expect(doc.length).toBe(50);
    expect(doc.description).toBe("desc");
    expect(doc.price).toBeUndefined();
    expect(doc.count).toBeUndefined();
    expect(doc.search_text).toContain("Болт DIN 933 M10x50");
  });
});
