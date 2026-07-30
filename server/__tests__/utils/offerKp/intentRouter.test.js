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

  it("routes multi-line RFQ to create_quote without export", () => {
    const rfq = [
      "Винт DIN 6912 M6x20 — 500 шт",
      "Винт M6x20 ГОСТ Р ИСО 1207-2013 — 500 шт",
      "Гайка М24 ГОСТ ISO 7040 — 28200 шт",
    ].join("\n");
    const result = routeOfferKpMessage(rfq);
    expect(result.primaryIntent).toBe(OFFER_KP_INTENTS.CREATE_QUOTE);
    expect(result.policy.allowExport).toBe(false);
    expect(result.policy.allowShopDbSearch).toBe(true);
    expect(result.signals.multiLineRfq).toBe(true);
  });

  it("exposes needsLlmIntentJudge only for ambiguous", () => {
    const {
      needsLlmIntentJudge,
    } = require("../../../utils/offerKp/intentRouter");
    expect(needsLlmIntentJudge(routeOfferKpMessage("найди болт DIN 933"))).toBe(
      false
    );
    expect(needsLlmIntentJudge(routeOfferKpMessage("кп"))).toBe(true);
  });
});
