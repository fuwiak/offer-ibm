/* eslint-env jest, node */

const {
  classifyInquiryMessageContribution,
  shouldMessageContributeInquiryLines,
  parseContributeAnswer,
} = require("../../../utils/offerKp/inquiryMessageGate");
const { routeOfferKpMessage } = require("../../../utils/offerKp/intentRouter");

describe("inquiryMessageGate", () => {
  const chatSamples = [
    "что ты умеешь",
    "покажи сводку",
    "почему такая цена",
    "добавь НДС",
    "Какова общая сумма заказа по текущему списку?",
    "Сделай КП по прикреплённой заявке",
    "привет",
  ];

  const rfqSamples = [
    "болт DIN 933 M8×40 8.8 — 100 шт",
    "добавь позицию: болт DIN 933 M8×40 — 100 шт",
    "Винт DIN 6912 M6x20 — 500 шт\nГайка М24 ГОСТ ISO 7040 — 28200 шт",
  ];

  it.each(chatSamples)("rejects chat/follow-up as draft line: %s", (text) => {
    const routed = routeOfferKpMessage(text);
    const result = classifyInquiryMessageContribution(text, {
      resolvedIntent: routed,
    });
    expect(result.contribute).toBe(false);
  });

  it.each(rfqSamples)("accepts RFQ / add-position as draft line: %s", (text) => {
    const routed = routeOfferKpMessage(text);
    const result = classifyInquiryMessageContribution(text, {
      resolvedIntent: routed,
    });
    expect(result.contribute).toBe(true);
  });

  it("fail-safe skips ambiguous without LLM under strict determinism", async () => {
    const prev = process.env.OFFER_KP_STRICT_DETERMINISM;
    process.env.OFFER_KP_STRICT_DETERMINISM = "true";
    try {
      const result = await shouldMessageContributeInquiryLines(
        "нужен крепёж по спецификации из письма клиента без размеров",
        { resolvedIntent: routeOfferKpMessage("кп") }
      );
      expect(result.contribute).toBe(false);
      expect(["heuristic", "fail_safe"]).toContain(result.source);
    } finally {
      if (prev === undefined) delete process.env.OFFER_KP_STRICT_DETERMINISM;
      else process.env.OFFER_KP_STRICT_DETERMINISM = prev;
    }
  });

  it("parses contribute JSON from LLM", () => {
    expect(parseContributeAnswer('{"contribute":true}')).toBe(true);
    expect(parseContributeAnswer('{"contribute":false}')).toBe(false);
    expect(parseContributeAnswer("nope")).toBe(null);
  });
});
