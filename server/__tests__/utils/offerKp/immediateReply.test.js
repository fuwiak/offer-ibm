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

  it("keeps out-of-scope prompts away from contaminated LLM history", () => {
    expect(resolveOfferKpImmediateReply("какая погода завтра?")).toContain(
      "Этот чат работает"
    );
  });
});
