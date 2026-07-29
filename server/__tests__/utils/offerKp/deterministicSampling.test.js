"use strict";

const {
  OFFER_KP_DETERMINISTIC_SAMPLING,
  offerKpStrictDeterminismEnabled,
  resolveOfferKpChatSampling,
  samplingToCompletionParams,
  compareByDeterministicTieBreak,
} = require("../../../utils/offerKp/deterministicSampling");
const {
  RESPONSE_FORMATS,
  parseProductSelectionPayload,
  parseOcrLinesPayload,
} = require("../../../utils/offerKp/llmJsonSchema");
const {
  shopDbSearchAgentLlmEnabled,
  parseLlmProductIds,
} = require("../../../utils/offerKp/searchAgent");

describe("deterministicSampling", () => {
  const ORIGINAL_STRICT = process.env.OFFER_KP_STRICT_DETERMINISM;

  afterEach(() => {
    if (ORIGINAL_STRICT === undefined)
      delete process.env.OFFER_KP_STRICT_DETERMINISM;
    else process.env.OFFER_KP_STRICT_DETERMINISM = ORIGINAL_STRICT;
  });

  it("defaults strict determinism to on", () => {
    delete process.env.OFFER_KP_STRICT_DETERMINISM;
    expect(offerKpStrictDeterminismEnabled()).toBe(true);
  });

  it("can be disabled via env", () => {
    process.env.OFFER_KP_STRICT_DETERMINISM = "0";
    expect(offerKpStrictDeterminismEnabled()).toBe(false);
  });

  it("forces temperature 0 even if extra tries to raise it", () => {
    const sampling = resolveOfferKpChatSampling({ temperature: 0.9 });
    expect(sampling.temperature).toBe(0);
    expect(sampling.top_p).toBe(1);
    expect(sampling.seed).toBe(OFFER_KP_DETERMINISTIC_SAMPLING.seed);
  });

  it("omits undefined keys in completion params", () => {
    expect(
      samplingToCompletionParams({
        temperature: 0,
        top_p: 1,
        seed: 1,
        response_format: RESPONSE_FORMATS.intentCategory,
      })
    ).toEqual({
      temperature: 0,
      top_p: 1,
      seed: 1,
      response_format: RESPONSE_FORMATS.intentCategory,
    });
  });

  it("tie-breaks equal scores by id", () => {
    const a = { id: 10, _score: 0.5 };
    const b = { id: 3, _score: 0.5 };
    expect(compareByDeterministicTieBreak(a, b)).toBeGreaterThan(0);
  });
});

describe("strict mode disables llm_rank", () => {
  const ORIGINAL_STRICT = process.env.OFFER_KP_STRICT_DETERMINISM;
  const ORIGINAL_LLM = process.env.SHOP_DB_SEARCH_AGENT_LLM;

  afterEach(() => {
    if (ORIGINAL_STRICT === undefined)
      delete process.env.OFFER_KP_STRICT_DETERMINISM;
    else process.env.OFFER_KP_STRICT_DETERMINISM = ORIGINAL_STRICT;
    if (ORIGINAL_LLM === undefined) delete process.env.SHOP_DB_SEARCH_AGENT_LLM;
    else process.env.SHOP_DB_SEARCH_AGENT_LLM = ORIGINAL_LLM;
  });

  it("blocks LLM ranking even when SHOP_DB_SEARCH_AGENT_LLM=1", () => {
    process.env.OFFER_KP_STRICT_DETERMINISM = "true";
    process.env.SHOP_DB_SEARCH_AGENT_LLM = "1";
    expect(shopDbSearchAgentLlmEnabled()).toBe(false);
  });

  it("allows LLM ranking only when strict is off and flag is on", () => {
    process.env.OFFER_KP_STRICT_DETERMINISM = "false";
    process.env.SHOP_DB_SEARCH_AGENT_LLM = "1";
    expect(shopDbSearchAgentLlmEnabled()).toBe(true);
  });
});

describe("constrained JSON parsers", () => {
  it("parses product_selection object", () => {
    expect(parseProductSelectionPayload({ product_ids: [11, "22", 11] })).toEqual([
      11, 22,
    ]);
  });

  it("parseLlmProductIds accepts constrained object text", () => {
    expect(parseLlmProductIds('{"product_ids":[101,202]}')).toEqual([101, 202]);
  });

  it("parses OCR lines object", () => {
    const lines = parseOcrLinesPayload({
      lines: [
        {
          name_verbatim: "Болт DIN 933 M10x80",
          quantity: 100,
          unit: "шт",
          confidence: 0.97,
        },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].name_verbatim).toBe("Болт DIN 933 M10x80");
  });
});
