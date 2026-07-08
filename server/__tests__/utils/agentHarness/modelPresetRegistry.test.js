const { OFFER_KP_LOCAL_MODELS } = require("../../../config/offerKp.models");
const {
  resolveModelHarnessPreset,
  listRegisteredModelHarnessPresets,
} = require("../../../utils/agentHarness/presets/modelPresetRegistry");
const { buildOfferKpHarness } = require("../../../utils/agentHarness/presets/offerKp");
const { DeepseekR1HarnessPreset } = require("../../../utils/agentHarness/presets/models/DeepseekR1HarnessPreset");
const { GptOss20bHarnessPreset } = require("../../../utils/agentHarness/presets/models/GptOss20bHarnessPreset");

describe("model-specific OfferKP harness presets", () => {
  it("registers all local Qwen LM Studio models", () => {
    const ids = listRegisteredModelHarnessPresets();
    for (const m of OFFER_KP_LOCAL_MODELS) {
      expect(ids).toContain(m.id);
    }
  });

  it("Deepseek preset uses 32k context and price-focused guidelines", () => {
    const preset = resolveModelHarnessPreset("deepseek/deepseek-r1-0528-qwen3-8b");
    expect(preset).toBeInstanceOf(DeepseekR1HarnessPreset);
    expect(preset.maxContextChars()).toBe(32_000);
    expect(preset.catalogMaxDocs()).toBe(1);
    expect(preset.extraGuidelines().some((l) => l.includes("32k"))).toBe(true);
  });

  it("GPT-OSS preset keeps full context window", () => {
    const preset = resolveModelHarnessPreset("openai/gpt-oss-20b");
    expect(preset).toBeInstanceOf(GptOss20bHarnessPreset);
    expect(preset.maxContextChars()).toBe(120_000);
  });

  it("buildOfferKpHarness applies model preset to harness state", async () => {
    const aibitat = { _chats: [] };
    const harness = await buildOfferKpHarness({
      aibitat,
      model: "deepseek/deepseek-r1-0528-qwen3-8b",
    });
    expect(harness.ctx.modelId).toBe("deepseek/deepseek-r1-0528-qwen3-8b");
    expect(harness.state.get("maxContextChars")).toBe(32_000);
    expect(harness.state.get("catalogMaxDocs")).toBe(1);
  });
});
