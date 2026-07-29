"use strict";

const { routeOfferKpMessage, OFFER_KP_INTENTS } = require("../../../utils/offerKp/intentRouter");
const {
  resolveDataQueryPlan,
} = require("../../../utils/offerKp/dataQueryPlans");
const { shouldRunShopEnrich } = require("../../../utils/offerKp/enrich");

describe("data_question intent + query plans (AUDYT_PIPELINE_RU)", () => {
  const cases = [
    ["Сколько товаров в каталоге?", "COUNT_ACTIVE_PRODUCTS"],
    ["Какие категории есть в базе?", "LIST_CATEGORIES"],
    ["Какой товар самый дорогой?", "TOP_BY_PRICE"],
    ["Есть ли дубликаты SKU?", "COUNT_DUPLICATE_SKUS"],
    ["Сколько строк в ShopDB без цены?", "COUNT_SKUS_WITHOUT_PRICE"],
    ["Расскажи о данных каталога", "CATALOG_OVERVIEW"],
    ["What products are in the catalog?", "CATALOG_OVERVIEW"],
    ["Ile produktów jest w katalogu?", "CATALOG_OVERVIEW"],
  ];

  it.each(cases)("%s → data_question + plan %s", (text, planId) => {
    const routed = routeOfferKpMessage(text);
    expect(routed.primaryIntent).toBe(OFFER_KP_INTENTS.DATA_QUESTION);
    expect(routed.policy.allowShopDbSearch).toBe(true);
    expect(routed.policy.allowQuoteMutation).toBe(false);
    expect(resolveDataQueryPlan(text)?.id).toBe(planId);
  });

  it("KP draft questions stay document_question and pass (not out_of_scope)", () => {
    for (const text of [
      "что сейчас в КП?",
      "какая сумма в черновике?",
      "сколько позиций в КП?",
    ]) {
      const routed = routeOfferKpMessage(text);
      expect(routed.primaryIntent).toBe(OFFER_KP_INTENTS.DOCUMENT_QUESTION);
      expect(routed.primaryIntent).not.toBe(OFFER_KP_INTENTS.OUT_OF_SCOPE);
    }
  });

  it("resolvedIntent prevents split-brain ShopDB skip", () => {
    const resolved = routeOfferKpMessage("Сколько товаров в каталоге?");
    expect(
      shouldRunShopEnrich("Сколько товаров в каталоге?", { resolvedIntent: resolved })
    ).toBe(true);
  });
});
