jest.mock("../../../utils/offerKp/embeddingSimilarity", () => {
  const actual = jest.requireActual("../../../utils/offerKp/embeddingSimilarity");
  return {
    ...actual,
    isEmbeddingSimilarityEnabled: () => true,
    embedQueryText: jest.fn(async () => [1, 0, 0, 0]),
    embedPassageTexts: jest.fn(async (texts) =>
      texts.map((_, i) => {
        const v = [0, 0, 0, 0];
        v[i % 4] = 1;
        return v;
      })
    ),
  };
});

const {
  searchCanonicalCatalogDense,
  setVectorIndexForTests,
  resetCanonicalCatalogCaches,
  denseEnabled,
} = require("../../../utils/offerKp/canonicalCatalogIndex");
const { embedQueryText } = require("../../../utils/offerKp/embeddingSimilarity");

describe("catalog dense retrieval", () => {
  const prevDense = process.env.SHOP_DB_CATALOG_DENSE;
  const prevIndex = process.env.SHOP_DB_CANONICAL_INDEX;

  beforeEach(() => {
    process.env.SHOP_DB_CATALOG_DENSE = "1";
    process.env.SHOP_DB_CANONICAL_INDEX = "1";
    resetCanonicalCatalogCaches();
    embedQueryText.mockClear();
    embedQueryText.mockResolvedValue([1, 0, 0, 0]);
  });

  afterEach(() => {
    if (prevDense === undefined) delete process.env.SHOP_DB_CATALOG_DENSE;
    else process.env.SHOP_DB_CATALOG_DENSE = prevDense;
    if (prevIndex === undefined) delete process.env.SHOP_DB_CANONICAL_INDEX;
    else process.env.SHOP_DB_CANONICAL_INDEX = prevIndex;
    resetCanonicalCatalogCaches();
  });

  it("reports dense enabled when flags allow", () => {
    expect(denseEnabled()).toBe(true);
  });

  it("returns top-K by cosine over the full in-memory matrix", async () => {
    // id 101 aligned with query [1,0,0,0]; id 102 orthogonal-ish; id 103 opposite-ish
    const matrix = Float32Array.from([
      1, 0, 0, 0, // 101
      0, 1, 0, 0, // 102
      0.2, 0.8, 0, 0, // 103
    ]);
    setVectorIndexForTests({ ids: [101, 102, 103], dims: 4, matrix });

    const hits = await searchCanonicalCatalogDense("болт M10", 2);
    expect(hits).toHaveLength(2);
    expect(hits[0].productId).toBe(101);
    expect(hits[0].score).toBeGreaterThan(0.99);
    expect(hits[1].productId).toBe(103);
    expect(embedQueryText).toHaveBeenCalledTimes(1);
  });

  it("returns empty when dense disabled", async () => {
    process.env.SHOP_DB_CATALOG_DENSE = "0";
    setVectorIndexForTests({
      ids: [1],
      dims: 4,
      matrix: Float32Array.from([1, 0, 0, 0]),
    });
    await expect(searchCanonicalCatalogDense("x", 5)).resolves.toEqual([]);
  });
});
