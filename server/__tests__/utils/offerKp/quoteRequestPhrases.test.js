const {
  isQuoteDocumentRequest,
  quoteDocumentStatusMessage,
} = require("../../../utils/offerKp/quoteRequestPhrases");

describe("quoteRequestPhrases", () => {
  it("detects short Russian KP commands", () => {
    expect(isQuoteDocumentRequest("сделай кп")).toBe(true);
    expect(isQuoteDocumentRequest("Сделать КП")).toBe(true);
    expect(isQuoteDocumentRequest("подготовь кп по заявке")).toBe(true);
    expect(isQuoteDocumentRequest("извлечь продукты и сделай кп под них")).toBe(
      true
    );
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

  it("detects an explicit agent quote without treating every agent call as КП", () => {
    expect(isQuoteDocumentRequest("@agent сделай кп")).toBe(true);
    expect(isQuoteDocumentRequest("@agent: подготовь коммерческое предложение"))
      .toBe(true);
  });
});
