const {
  resolveOfferKpEffectiveModel,
} = require("../../../config/offerKp.models");

describe("resolveOfferKpEffectiveModel", () => {
  it("prefers chatModel when it diverges from stale agentModel", () => {
    expect(
      resolveOfferKpEffectiveModel({
        chatModel: "deepseek/deepseek-r1-0528-qwen3-8b",
        agentModel: "openai/gpt-oss-20b",
      })
    ).toBe("deepseek/deepseek-r1-0528-qwen3-8b");
  });

  it("uses agentModel when chatModel is empty", () => {
    expect(
      resolveOfferKpEffectiveModel({
        agentModel: "google/gemma-4-12b",
      })
    ).toBe("google/gemma-4-12b");
  });

  it("returns default when workspace has no models", () => {
    expect(resolveOfferKpEffectiveModel(null)).toBe("openai/gpt-oss-20b");
  });
});
