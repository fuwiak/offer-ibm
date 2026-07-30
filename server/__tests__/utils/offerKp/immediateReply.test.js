const {
  resolveOfferKpImmediateReply,
} = require("../../../utils/offerKp/immediateReply");

describe("OfferKP immediate casual reply", () => {
  it.each([
    ["hello", "Hello!"],
    ["how are you?", "I'm doing well"],
    ["привет", "Здравствуйте!"],
    ["скажи 300", "300"],
    ["скажи банан", "банан"],
  ])("answers %s without invoking a model", (message, prefix) => {
    expect(resolveOfferKpImmediateReply(message)).toEqual(
      expect.stringContaining(prefix)
    );
  });

  it("does not intercept catalog work", () => {
    expect(
      resolveOfferKpImmediateReply("найди болт DIN 933 M10x80")
    ).toBeNull();
  });

  it("answers system_help with capabilities, not catalog cards", () => {
    const reply = resolveOfferKpImmediateReply("что ты умеешь");
    expect(reply).toContain("заявк");
    expect(reply).toContain("ShopDB");
    expect(reply).not.toMatch(/Товар\s*:/i);
    expect(reply).not.toMatch(/\[Каталог/i);
    expect(reply).not.toMatch(/1000000000/);
  });

  it("answers English system_help without catalog dump", () => {
    const reply = resolveOfferKpImmediateReply("what can you do?");
    expect(reply).toBeTruthy();
    expect(reply).not.toMatch(/Товар\s*:/i);
    expect(reply.toLowerCase()).toMatch(/catalog|shopdb|quote|rfq|ocr/);
  });

  it("does not block technical document / OCR questions", () => {
    expect(resolveOfferKpImmediateReply("show extracted text")).toBeNull();
    expect(resolveOfferKpImmediateReply("покажи извлечённый текст")).toBeNull();
    // "how does OCR work?" is system_help → canned reply, not null
    const ocrHelp = resolveOfferKpImmediateReply("how does OCR work?");
    expect(ocrHelp).toBeTruthy();
    expect(ocrHelp).not.toMatch(/Товар\s*:/i);
  });

  it("keeps out-of-scope prompts away from contaminated LLM history", () => {
    expect(resolveOfferKpImmediateReply("какая погода завтра?")).toContain(
      "Этот чат работает"
    );
  });
});
