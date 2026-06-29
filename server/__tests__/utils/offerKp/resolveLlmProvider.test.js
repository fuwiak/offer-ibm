const {
  resolveLlmProviderAndModel,
  coerceToLocalModel,
} = require("../../../utils/offerKpApp/resolveLlmProvider");

describe("resolveLlmProvider", () => {
  const prevPref = process.env.LMSTUDIO_MODEL_PREF;

  afterEach(() => {
    if (prevPref === undefined) delete process.env.LMSTUDIO_MODEL_PREF;
    else process.env.LMSTUDIO_MODEL_PREF = prevPref;
  });

  it("keeps LM Studio catalog model ids from UI", () => {
    expect(
      coerceToLocalModel("google/gemma-4-26b-a4b", [
        "google/gemma-4-26b-a4b",
        "openai/gpt-oss-20b",
      ])
    ).toBe("google/gemma-4-26b-a4b");
  });

  it("does not mutate global LMSTUDIO_MODEL_PREF on resolve", () => {
    process.env.LMSTUDIO_MODEL_PREF = "openai/gpt-oss-20b";
    const resolved = resolveLlmProviderAndModel({
      provider: "lmstudio",
      model: "google/gemma-4-26b-a4b",
    });
    expect(resolved.model).toBe("google/gemma-4-26b-a4b");
    expect(process.env.LMSTUDIO_MODEL_PREF).toBe("openai/gpt-oss-20b");
  });
});
