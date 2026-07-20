const fs = require("fs");
const path = require("path");

const {
  OFFER_KP_INTENTS,
  START_QUOTE_PROMPTS,
  routeOfferKpMessage,
} = require("../../../utils/offerKp/intentRouter");
const { shouldRunShopEnrich } = require("../../../utils/offerKp/enrich");

const fixturePath = path.join(__dirname, "fixtures/intentRouting.jsonl");
const cases = fs
  .readFileSync(fixturePath, "utf8")
  .trim()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line));

describe("OfferKP deterministic intent router", () => {
  it.each(cases)("routes: $text", (fixture) => {
    const result = routeOfferKpMessage(fixture.text);
    expect(result.primaryIntent).toBe(fixture.intent);
    expect(result.intent).toBe(fixture.intent);
    expect(result.policy.allowWebSearch).toBe(false);
    expect(result.policy.allowLlmPrice).toBe(false);

    for (const key of [
      "allowShopDbSearch",
      "allowQuoteMutation",
      "allowCatalogPriceUse",
      "allowExport",
    ]) {
      if (fixture[key] != null) expect(result.policy[key]).toBe(fixture[key]);
    }
    if (fixture.alsoIntent)
      expect(result.intents).toContain(fixture.alsoIntent);
  });

  it("keeps all five Start with KP prompts in the server vocabulary", () => {
    expect(START_QUOTE_PROMPTS).toHaveLength(5);
    expect(
      START_QUOTE_PROMPTS.map((text) => routeOfferKpMessage(text).intent)
    ).toEqual([
      OFFER_KP_INTENTS.PRODUCT_INQUIRY,
      OFFER_KP_INTENTS.CREATE_QUOTE,
      OFFER_KP_INTENTS.PRODUCT_SEARCH,
      OFFER_KP_INTENTS.PRODUCT_SEARCH,
      OFFER_KP_INTENTS.CREATE_QUOTE,
    ]);
  });

  it("never grants forbidden price or web capabilities", () => {
    for (const fixture of cases) {
      const { policy } = routeOfferKpMessage(fixture.text);
      expect(policy.allowWebSearch).toBe(false);
      expect(policy.allowLlmPrice).toBe(false);
    }
  });

  it("gates ShopDB enrichment without changing its downstream contract", () => {
    expect(shouldRunShopEnrich("Найди болт DIN 933 M10x80")).toBe(true);
    expect(
      shouldRunShopEnrich(
        "Найди цену на сайте конкурента для болта DIN 933 M10x80"
      )
    ).toBe(false);
    expect(shouldRunShopEnrich("Какая погода в Москве?")).toBe(false);
  });
});
