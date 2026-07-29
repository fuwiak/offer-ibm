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

  beforeEach(() => {
    // Judge tests need relaxed mode — strict disables LLM judges by design.
    process.env.OFFER_KP_STRICT_DETERMINISM = "false";
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (ORIGINAL_ENV === undefined) delete process.env.OFFER_KP_INTENT_LLM_JUDGE;
    else process.env.OFFER_KP_INTENT_LLM_JUDGE = ORIGINAL_ENV;
    if (ORIGINAL_STRICT === undefined)
      delete process.env.OFFER_KP_STRICT_DETERMINISM;
    else process.env.OFFER_KP_STRICT_DETERMINISM = ORIGINAL_STRICT;
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

    it("returns null under strict determinism", async () => {
      process.env.OFFER_KP_STRICT_DETERMINISM = "true";
      mockAnswer("create_quote");
      const result = await classifyAmbiguousIntentWithLlm("кп");
      expect(result).toBeNull();
      expect(getLLMProviderWithFallback).not.toHaveBeenCalled();
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

    it("keeps ambiguous under strict determinism (no LLM judge)", async () => {
      process.env.OFFER_KP_STRICT_DETERMINISM = "true";
      mockAnswer("create_quote");
      const result = await resolveOfferKpIntent("кп");
      expect(result.primaryIntent).toBe(OFFER_KP_INTENTS.AMBIGUOUS);
      expect(getLLMProviderWithFallback).not.toHaveBeenCalled();
    });
  });

  it("is enabled when strict determinism is off", () => {
    process.env.OFFER_KP_STRICT_DETERMINISM = "false";
    expect(intentLlmJudgeEnabled()).toBe(true);
  });
});
