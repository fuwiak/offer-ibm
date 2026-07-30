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

/**
 * Multi-line RFQ (2+ parsed positions) must go through matchInquiry → draft /
 * quote artifacts — not the one-shot grounded catalog short-circuit.
 * Searching the whole blob as one ShopDB query also collapses conflicting
 * DIN/ISO/M-sizes and often yields zero hits → false "не найдено".
 */
function isMultiLineInquiry(message = "") {
  try {
    const { parseInquiryText } = require("./parseInquiry");
    return parseInquiryText(String(message || "")).length >= 2;
  } catch {
    return false;
  }
}

function shouldRenderCatalogDirectly(message = "", resolvedIntent = null) {
  const primaryIntent =
    resolvedIntent?.primaryIntent ||
    resolvedIntent ||
    routeOfferKpMessage(message).primaryIntent;
  if (!DIRECT_CATALOG_INTENTS.has(primaryIntent)) return false;
  if (isMultiLineInquiry(message)) return false;
  return true;
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

  const isCompare = /(?:сравни|сверь|сравните|porównaj|compare)\b/iu.test(
    String(message || "")
  );
  const preface = isCompare
    ? "Сравнение по каталогу purolat.com (ShopDB), без формирования КП:\n\n"
    : "";

  return `${preface}${blocks.join("\n\n")}\n\nИсточник: каталог purolat.com (MySQL).`;
}

module.exports = {
  renderGroundedCatalogResponse,
  sanitizeOfferKpHistory,
  shouldRenderCatalogDirectly,
  isMultiLineInquiry,
};
