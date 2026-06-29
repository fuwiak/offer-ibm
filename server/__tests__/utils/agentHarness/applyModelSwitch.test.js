/* eslint-env jest, node */

process.env.STORAGE_DIR = __dirname;

const { applyHarnessModelSwitch } = require("../../../utils/agentHarness/applyModelSwitch");

describe("applyHarnessModelSwitch", () => {
  it("updates harness preset and aibitat defaultProvider model", () => {
    const aibitat = {
      model: "openai/gpt-oss-20b",
      defaultProvider: { provider: "lmstudio", model: "openai/gpt-oss-20b" },
      provider: { model: "openai/gpt-oss-20b" },
    };
    const harness = {
      ctx: {},
      state: {
        data: {},
        get(key) {
          return this.data[key];
        },
        set(key, value) {
          this.data[key] = value;
        },
      },
      aibitat,
    };

    applyHarnessModelSwitch(harness, "google/gemma-4-12b", {
      from: "openai/gpt-oss-20b",
      reason: "quote_pdf_document",
    });

    expect(harness.ctx.modelId).toBe("google/gemma-4-12b");
    expect(aibitat.model).toBe("google/gemma-4-12b");
    expect(aibitat.defaultProvider.model).toBe("google/gemma-4-12b");
    expect(harness.state.get("catalogMaxDocs")).toBe(2);
    expect(harness.state.get("quotePdfModelSwitch")?.model).toBe(
      "google/gemma-4-12b"
    );
  });
});
