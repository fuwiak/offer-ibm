const {
  isQuoteDocumentRequest,
  isQuoteFromPriorContextFollowUp,
  quoteDocumentStatusMessage,
} = require("../../../utils/offerKp/quoteRequestPhrases");
const { routeOfferKpMessage } = require("../../../utils/offerKp/intentRouter");

describe("quoteRequestPhrases", () => {
  it("detects short Russian KP commands", () => {
    expect(isQuoteDocumentRequest("сделай кп")).toBe(true);
    expect(isQuoteDocumentRequest("Сделать КП")).toBe(true);
    expect(isQuoteDocumentRequest("подготовь кп по заявке")).toBe(true);
    expect(isQuoteDocumentRequest("извлечь продукты и сделай кп под них")).toBe(
      true
    );
    expect(isQuoteDocumentRequest("cделай кп")).toBe(true);
    expect(
      isQuoteDocumentRequest("cделай кп с Current Context (1 files)")
    ).toBe(true);
  });

  it("detects Polish KP commands", () => {
    expect(isQuoteDocumentRequest("zrob kp")).toBe(true);
    expect(isQuoteDocumentRequest("przygotuj ofertę")).toBe(true);
  });

  it("returns agent status message for UI", () => {
    expect(quoteDocumentStatusMessage()).toContain(
      "Analyzing and verifying the source document"
    );
  });

  it("returns false for unrelated messages", () => {
    expect(isQuoteDocumentRequest("какая погода")).toBe(false);
    expect(isQuoteDocumentRequest("@agent какая погода")).toBe(false);
  });

  it("rejects quote wording that asks to invent a price", () => {
    expect(
      isQuoteDocumentRequest("Создай КП на гайки, цену придумай сам")
    ).toBe(false);
  });

  it("detects an explicit agent quote without treating every agent call as КП", () => {
    expect(isQuoteDocumentRequest("@agent сделай кп")).toBe(true);
    expect(
      isQuoteDocumentRequest("@agent: подготовь коммерческое предложение")
    ).toBe(true);
  });

  it("soft UI follow-up keeps create_quote intent but does not force KP document path", () => {
    const text =
      "Создайте коммерческое предложение на основе этих цен и количеств.";
    expect(isQuoteFromPriorContextFollowUp(text)).toBe(true);
    expect(isQuoteDocumentRequest(text)).toBe(false);
    expect(routeOfferKpMessage(text).primaryIntent).toBe("create_quote");
  });

  it("still forces KP document path for RFQ body or explicit short KP command", () => {
    expect(isQuoteFromPriorContextFollowUp("сделай КП")).toBe(false);
    expect(isQuoteDocumentRequest("сделай КП")).toBe(true);
    expect(
      isQuoteFromPriorContextFollowUp(
        "на основе этих цен: болт М8×40 DIN 933 — 100 шт"
      )
    ).toBe(false);
  });

  it("treats Latin-c KP commands as command-only (not a product line)", () => {
    const {
      isQuoteCommandOnly,
    } = require("../../../utils/offerKp/quoteRequestPhrases");
    expect(isQuoteCommandOnly("cделай кп")).toBe(true);
    expect(isQuoteCommandOnly("сделай кп")).toBe(true);
    expect(
      isQuoteCommandOnly("болт М10х50 DIN 933 — 100 шт\nсделай кп")
    ).toBe(false);
  });
});
