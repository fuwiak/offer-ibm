jest.mock("../../../utils/helpers", () => ({
  getLLMProviderWithFallback: jest.fn(),
}));

const { getLLMProviderWithFallback } = require("../../../utils/helpers");
const {
  parseIntentAnswer,
  classifyAmbiguousIntentWithLlm,
  resolveOfferKpIntent,
  intentLlmJudgeEnabled,
} = require("../../../utils/offerKp/intentLlmJudge");
const { OFFER_KP_INTENTS } = require("../../../utils/offerKp/intentRouter");

describe("intentLlmJudge", () => {
  const ORIGINAL_ENV = process.env.OFFER_KP_INTENT_LLM_JUDGE;
  const ORIGINAL_STRICT = process.env.OFFER_KP_STRICT_DETERMINISM;
  const ORIGINAL_OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
  const ORIGINAL_MEMORY = process.env.OFFER_KP_EXPERIENCE_MEMORY;
  const ORIGINAL_FETCH = global.fetch;

  beforeEach(() => {
    delete process.env.OFFER_KP_INTENT_LLM_JUDGE;
    delete process.env.OPENROUTER_API_KEY;
    process.env.OFFER_KP_EXPERIENCE_MEMORY = "0";
    // Strict must not silence the closed-set intent judge.
    process.env.OFFER_KP_STRICT_DETERMINISM = "true";
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (ORIGINAL_ENV === undefined)
      delete process.env.OFFER_KP_INTENT_LLM_JUDGE;
    else process.env.OFFER_KP_INTENT_LLM_JUDGE = ORIGINAL_ENV;
    if (ORIGINAL_STRICT === undefined)
      delete process.env.OFFER_KP_STRICT_DETERMINISM;
    else process.env.OFFER_KP_STRICT_DETERMINISM = ORIGINAL_STRICT;
    if (ORIGINAL_OPENROUTER_KEY === undefined)
      delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = ORIGINAL_OPENROUTER_KEY;
    if (ORIGINAL_MEMORY === undefined)
      delete process.env.OFFER_KP_EXPERIENCE_MEMORY;
    else process.env.OFFER_KP_EXPERIENCE_MEMORY = ORIGINAL_MEMORY;
    global.fetch = ORIGINAL_FETCH;
  });

  function mockAnswer(textResponse) {
    getLLMProviderWithFallback.mockResolvedValue({
      getChatCompletion: jest.fn().mockResolvedValue({ textResponse }),
    });
  }

  describe("parseIntentAnswer", () => {
    it("accepts an exact category code", () => {
      expect(parseIntentAnswer("create_quote")).toBe(
        OFFER_KP_INTENTS.CREATE_QUOTE
      );
    });

    it("accepts constrained JSON category", () => {
      expect(parseIntentAnswer('{"category":"product_search"}')).toBe(
        OFFER_KP_INTENTS.PRODUCT_SEARCH
      );
    });

    it("accepts a category code with trailing text/punctuation", () => {
      expect(parseIntentAnswer("edit_quote.")).toBe(
        OFFER_KP_INTENTS.EDIT_QUOTE
      );
    });

    it("returns null for unrecognized output", () => {
      expect(parseIntentAnswer("не знаю")).toBeNull();
    });
  });

  describe("classifyAmbiguousIntentWithLlm", () => {
    it("returns the judged category on a clean answer", async () => {
      mockAnswer("product_search");
      const result = await classifyAmbiguousIntentWithLlm("что есть похожее?");
      expect(result).toBe(OFFER_KP_INTENTS.PRODUCT_SEARCH);
    });

    it("uses DeepSeek V4 Flash through OpenRouter when configured", async () => {
      process.env.OPENROUTER_API_KEY = "test-key";
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"category":"product_search"}' } }],
        }),
      });
      const result = await classifyAmbiguousIntentWithLlm("что есть похожее?");
      expect(result).toBe(OFFER_KP_INTENTS.PRODUCT_SEARCH);
      const request = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(request.model).toBe("deepseek/deepseek-v4-flash");
      expect(getLLMProviderWithFallback).not.toHaveBeenCalled();
    });

    it("falls back to the workspace connector when OpenRouter fails", async () => {
      process.env.OPENROUTER_API_KEY = "test-key";
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "teacher unavailable" } }),
      });
      mockAnswer('{"category":"create_quote"}');
      const result = await classifyAmbiguousIntentWithLlm("сделай кп");
      expect(result).toBe(OFFER_KP_INTENTS.CREATE_QUOTE);
      expect(getLLMProviderWithFallback).toHaveBeenCalledTimes(1);
    });

    it("fails safe (returns null) when the provider throws", async () => {
      getLLMProviderWithFallback.mockRejectedValue(new Error("no provider"));
      const result = await classifyAmbiguousIntentWithLlm("кп");
      expect(result).toBeNull();
    });

    it("returns null when disabled via env", async () => {
      process.env.OFFER_KP_INTENT_LLM_JUDGE = "false";
      mockAnswer("create_quote");
      const result = await classifyAmbiguousIntentWithLlm("кп");
      expect(result).toBeNull();
      expect(getLLMProviderWithFallback).not.toHaveBeenCalled();
    });

    it("still runs under strict determinism (closed-set category only)", async () => {
      process.env.OFFER_KP_STRICT_DETERMINISM = "true";
      mockAnswer("create_quote");
      const result = await classifyAmbiguousIntentWithLlm("кп");
      expect(result).toBe(OFFER_KP_INTENTS.CREATE_QUOTE);
      expect(getLLMProviderWithFallback).toHaveBeenCalledTimes(1);
    });

    it("returns null for an empty message without calling the provider", async () => {
      const result = await classifyAmbiguousIntentWithLlm("   ");
      expect(result).toBeNull();
      expect(getLLMProviderWithFallback).not.toHaveBeenCalled();
    });
  });

  describe("resolveOfferKpIntent", () => {
    it("never calls the LLM for a confidently-routed message", async () => {
      const result = await resolveOfferKpIntent("Найди болт DIN 933 M10x80");
      expect(result.primaryIntent).toBe(OFFER_KP_INTENTS.PRODUCT_SEARCH);
      expect(getLLMProviderWithFallback).not.toHaveBeenCalled();
    });

    it("never calls the LLM for multi-line RFQ (create_quote, not ambiguous)", async () => {
      const rfq = [
        "Винт DIN 6912 M6x20 — 500 шт",
        "Винт M6x20 ГОСТ Р ИСО 1207-2013 — 500 шт",
      ].join("\n");
      const result = await resolveOfferKpIntent(rfq);
      expect(result.primaryIntent).toBe(OFFER_KP_INTENTS.CREATE_QUOTE);
      expect(result.policy.allowExport).toBe(false);
      expect(getLLMProviderWithFallback).not.toHaveBeenCalled();
    });

    it("escalates to the judge only when the router is ambiguous", async () => {
      mockAnswer("create_quote");
      const result = await resolveOfferKpIntent("кп");
      expect(getLLMProviderWithFallback).toHaveBeenCalledTimes(1);
      expect(result.primaryIntent).toBe(OFFER_KP_INTENTS.CREATE_QUOTE);
      expect(result.signals.llmJudge).toBe(true);
    });

    it("keeps the original ambiguous result when the judge fails", async () => {
      getLLMProviderWithFallback.mockRejectedValue(new Error("timeout"));
      const result = await resolveOfferKpIntent("кп");
      expect(result.primaryIntent).toBe(OFFER_KP_INTENTS.AMBIGUOUS);
    });

    it("can still escalate under strict determinism when ambiguous", async () => {
      process.env.OFFER_KP_STRICT_DETERMINISM = "true";
      mockAnswer("create_quote");
      const result = await resolveOfferKpIntent("кп");
      expect(result.primaryIntent).toBe(OFFER_KP_INTENTS.CREATE_QUOTE);
      expect(getLLMProviderWithFallback).toHaveBeenCalledTimes(1);
    });
  });

  it("is enabled by default (including under strict determinism)", () => {
    process.env.OFFER_KP_STRICT_DETERMINISM = "true";
    expect(intentLlmJudgeEnabled()).toBe(true);
  });
});
