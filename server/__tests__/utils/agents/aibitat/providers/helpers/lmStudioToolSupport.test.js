/* eslint-env jest, node */

const {
  isLmStudioJinjaToolTemplateError,
  lmStudioModelAllowsNativeTools,
} = require("../../../../../../utils/agents/aibitat/providers/helpers/lmStudioToolSupport");

describe("lmStudioToolSupport", () => {
  it("blocks native tools for Qwen VL resident models", () => {
    expect(lmStudioModelAllowsNativeTools("qwen/qwen3-vl-8b")).toBe(false);
    expect(lmStudioModelAllowsNativeTools("qwen/qwen3-vl-8b-thinking")).toBe(
      false
    );
    expect(lmStudioModelAllowsNativeTools("qwen/qwen2.5-vl-7b")).toBe(false);
  });

  it("allows native tools for text agent brains", () => {
    expect(lmStudioModelAllowsNativeTools("openai/gpt-oss-20b")).toBe(true);
    expect(lmStudioModelAllowsNativeTools("qwen/qwen3-14b")).toBe(true);
  });

  it("detects LM Studio Jinja tool-template crashes", () => {
    expect(
      isLmStudioJinjaToolTemplateError({
        message:
          'Error rendering prompt with jinja template: "Cannot call something that is not a function: got ObjectValue"',
      })
    ).toBe(true);
    expect(
      isLmStudioJinjaToolTemplateError({
        error: { message: "prompt template issue ObjectValue" },
      })
    ).toBe(true);
    expect(isLmStudioJinjaToolTemplateError(new Error("rate limit"))).toBe(
      false
    );
  });
});
