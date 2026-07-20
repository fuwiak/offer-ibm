/* eslint-env jest, node */

const {
  lookupKnownContextWindow,
  FALLBACK_CONTEXT_WINDOW,
} = require("../../config/openRouter.contextWindows");
const { OpenRouterLLM } = require("../../utils/AiProviders/openRouter");

/**
 * Регрессия прод-бага: web-scraping/RAG обрывались на «exceeds the model's
 * context limit» при 830/33K токенов, потому что OpenRouterLLM.promptWindowLimit()
 * читал storage/models/openrouter/models.json — кэш, который никогда не
 * заполняется в agent-пайплайне OfferKP (isValidChatCompletionModel не
 * вызывается) — и молча падал на 4096 для ЛЮБОЙ модели OpenRouter,
 * включая teacher-модели с окном 200K–1M+.
 */
describe("openRouter.contextWindows", () => {
  it("knows the context window for the configured teacher model", () => {
    expect(lookupKnownContextWindow("google/gemini-2.5-flash")).toBe(1_048_576);
  });

  it("returns null for unknown models (caller decides the fallback)", () => {
    expect(lookupKnownContextWindow("vendor/does-not-exist")).toBeNull();
  });

  it("fallback window is at least the LM Studio default (32768), not a tiny 4096", () => {
    expect(FALLBACK_CONTEXT_WINDOW).toBeGreaterThanOrEqual(32_768);
  });
});

describe("OpenRouterLLM.promptWindowLimit", () => {
  it("uses the curated window for a known model, not the 4096 cache-miss default", () => {
    expect(OpenRouterLLM.promptWindowLimit("google/gemini-2.5-flash")).toBe(
      1_048_576
    );
  });

  it("uses the curated window for the previous teacher model too", () => {
    expect(
      OpenRouterLLM.promptWindowLimit("qwen/qwen3-vl-235b-a22b-instruct")
    ).toBe(131_072);
  });

  it("never silently returns 4096 for an unknown model — falls back to 32768", () => {
    const limit = OpenRouterLLM.promptWindowLimit("vendor/brand-new-model");
    expect(limit).toBe(FALLBACK_CONTEXT_WINDOW);
    expect(limit).not.toBe(4096);
  });
});
