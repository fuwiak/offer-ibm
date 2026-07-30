"use strict";

const {
  shouldContinueWithoutChatLlm,
  buildLlmDownChatReply,
} = require("../../../utils/offerKp/llmDownFallback");
const {
  OFFER_KP_INTENTS,
  routeOfferKpMessage,
} = require("../../../utils/offerKp/intentRouter");

describe("llmDownFallback", () => {
  const rfq = [
    "1. Винт ГОСТ ISO 7380-1-М10х25-8.8 – 1700 шт.",
    "2.Винт ГОСТ ISO 7380-1-М8х70-8.8 – 400 шт.",
    "3. Винт М5х16-А4 DIN 7991 – 500 шт.",
  ].join("\n");

  it("routes pasted RFQ to create_quote", () => {
    const routed = routeOfferKpMessage(rfq);
    expect(routed.primaryIntent).toBe(OFFER_KP_INTENTS.CREATE_QUOTE);
    expect(routed.signals?.multiLineRfq).toBe(true);
  });

  it("lets create_quote / RFQ continue when chat LLM is down", () => {
    const routed = routeOfferKpMessage(rfq);
    expect(shouldContinueWithoutChatLlm(routed, false)).toBe(true);
  });

  it("fail-fasts for prompts with no ShopDB work", () => {
    const routed = routeOfferKpMessage("объясни квантовую физику");
    expect(routed.primaryIntent).toBe(OFFER_KP_INTENTS.OUT_OF_SCOPE);
    expect(shouldContinueWithoutChatLlm(routed, false)).toBe(false);
  });

  it("continues when quoteDocumentRequest even if intent weak", () => {
    expect(
      shouldContinueWithoutChatLlm(
        { primaryIntent: OFFER_KP_INTENTS.AMBIGUOUS },
        true
      )
    ).toBe(true);
  });

  it("builds draft-aware reply without inventing prices", () => {
    const text = buildLlmDownChatReply({
      draft: { lines: [{}, {}, {}] },
      requestId: "abc",
    });
    expect(text).toContain("3 строк");
    expect(text).toContain("Сводка позиций");
    expect(text).toContain("requestId=abc");
    expect(text).not.toMatch(/\d+[.,]\d+\s*₽/);
  });
});
