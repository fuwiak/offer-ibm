"use strict";

const { OFFER_KP_INTENTS, routeOfferKpMessage } = require("./intentRouter");

const DIRECT_CATALOG_INTENTS = new Set([
  OFFER_KP_INTENTS.PRODUCT_INQUIRY,
  OFFER_KP_INTENTS.PRODUCT_SEARCH,
]);

function roleOf(entry = {}) {
  return String(entry.role || entry.from || entry.type || "")
    .trim()
    .toLowerCase();
}

function textOf(entry = {}) {
  return String(
    entry.content || entry.text || entry.message || entry.userPrompt || ""
  );
}

function sanitizeOfferKpHistory(history = []) {
  if (!Array.isArray(history)) return [];
  return history.filter((entry) => {
    const role = roleOf(entry);
    const assistant = ["assistant", "agent", "@agent", "ai"].includes(role);
    return !(assistant && /\[Каталог\s*·/iu.test(textOf(entry)));
  });
}

function shouldRenderCatalogDirectly(message = "", resolvedIntent = null) {
  const primaryIntent =
    resolvedIntent?.primaryIntent ||
    resolvedIntent ||
    routeOfferKpMessage(message).primaryIntent;
  return DIRECT_CATALOG_INTENTS.has(primaryIntent);
}

function renderGroundedCatalogResponse(
  message = "",
  catalogBlocks = [],
  resolvedIntent = null
) {
  if (!shouldRenderCatalogDirectly(message, resolvedIntent)) return null;
  const blocks = (catalogBlocks || [])
    .filter((block) => /^\s*\[Каталог\s*·/iu.test(String(block || "")))
    .slice(0, 8);

  if (!blocks.length) {
    return "В каталоге purolat.com не найдено подтверждённых совпадений. Уточните стандарт, размер, материал или SKU.";
  }

  return `${blocks.join("\n\n")}\n\nИсточник: каталог purolat.com (MySQL).`;
}

module.exports = {
  renderGroundedCatalogResponse,
  sanitizeOfferKpHistory,
  shouldRenderCatalogDirectly,
};
