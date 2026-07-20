describe("embeddingSimilarity", () => {
  const ENV_KEY = "SHOP_DB_EMBEDDING_SIMILARITY";
  const originalEnv = process.env[ENV_KEY];

  afterEach(() => {
    jest.resetModules();
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it("returns an empty map without touching the model when disabled via env", async () => {
    process.env[ENV_KEY] = "0";
    const {
      computeEmbeddingSimilarities,
      isEmbeddingSimilarityEnabled,
      // eslint-disable-next-line global-require
    } = require("../../../utils/offerKp/embeddingSimilarity");

    expect(isEmbeddingSimilarityEnabled()).toBe(false);
    const result = await computeEmbeddingSimilarities("Болт DIN 933 M8x40", [
      { id: 1, name: "Болт DIN 933 M8x40 оцинк" },
    ]);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("short-circuits on empty query/candidates without throwing", async () => {
    // eslint-disable-next-line global-require
    const { computeEmbeddingSimilarities } = require("../../../utils/offerKp/embeddingSimilarity");

    await expect(computeEmbeddingSimilarities("", [])).resolves.toEqual(
      new Map()
    );
    await expect(
      computeEmbeddingSimilarities("Болт DIN 933 M8x40", [])
    ).resolves.toEqual(new Map());
  });
});
