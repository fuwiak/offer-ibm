describe("crossEncoderRerank", () => {
  const ENV_KEYS = [
    "SHOP_DB_RERANKER_ENABLED",
    "SHOP_DB_RERANKER_MODEL",
    "SHOP_DB_RERANKER_MODEL_FILE",
    "SHOP_DB_RERANKER_QUANTIZED",
    "SHOP_DB_RERANKER_MAX_CANDIDATES",
  ];
  const originalEnv = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]])
  );

  afterEach(() => {
    jest.resetModules();
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("is disabled by default and returns an empty map without touching the model", async () => {
    delete process.env.SHOP_DB_RERANKER_ENABLED;
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
    process.env.SHOP_DB_RERANKER_ENABLED = "1";
    // eslint-disable-next-line global-require
    const { computeRerankScores } = require("../../../utils/offerKp/crossEncoderRerank");

    await expect(computeRerankScores("", [])).resolves.toEqual(new Map());
    await expect(
      computeRerankScores("Болт DIN 933 M16x70", [])
    ).resolves.toEqual(new Map());
  });

  it("uses the lightweight multilingual MiniLM L6 defaults", () => {
    delete process.env.SHOP_DB_RERANKER_ENABLED;
    delete process.env.SHOP_DB_RERANKER_MODEL;
    delete process.env.SHOP_DB_RERANKER_MODEL_FILE;
    delete process.env.SHOP_DB_RERANKER_QUANTIZED;
    delete process.env.SHOP_DB_RERANKER_MAX_CANDIDATES;

    const {
      getRerankerConfig,
      // eslint-disable-next-line global-require
    } = require("../../../utils/offerKp/crossEncoderRerank");

    expect(getRerankerConfig()).toMatchObject({
      model: "Slite/mmarco-mMiniLMv2-L6-H384-v1-onnx-o4",
      modelFile: "model_optimized.onnx",
      quantized: false,
      maxCandidates: 5,
    });
  });
});
