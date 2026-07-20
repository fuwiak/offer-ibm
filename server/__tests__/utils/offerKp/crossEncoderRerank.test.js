describe("crossEncoderRerank", () => {
  const ENV_KEY = "SHOP_DB_RERANKER_ENABLED";
  const originalEnv = process.env[ENV_KEY];

  afterEach(() => {
    jest.resetModules();
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it("is disabled by default and returns an empty map without touching the model", async () => {
    delete process.env[ENV_KEY];
    const {
      computeRerankScores,
      isRerankerEnabled,
      // eslint-disable-next-line global-require
    } = require("../../../utils/offerKp/crossEncoderRerank");

    expect(isRerankerEnabled()).toBe(false);
    const result = await computeRerankScores("Болт DIN 933 M16x70", [
      { id: 1, name: "Болт DIN 933 M 16x 70 10.9 оцинк" },
    ]);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("short-circuits on empty query/candidates without throwing", async () => {
    process.env[ENV_KEY] = "1";
    // eslint-disable-next-line global-require
    const { computeRerankScores } = require("../../../utils/offerKp/crossEncoderRerank");

    await expect(computeRerankScores("", [])).resolves.toEqual(new Map());
    await expect(
      computeRerankScores("Болт DIN 933 M16x70", [])
    ).resolves.toEqual(new Map());
  });
});
