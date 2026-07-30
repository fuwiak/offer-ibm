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

function normalizeUrlKey(url = "") {
  return String(url || "")
    .trim()
    .replace(/[)\].,;]+$/g, "")
    .toLowerCase();
}

/** URLs / SKUs that came from ShopDB enrich or priced draft — never LLM. */
function collectAllowedCatalogFacts(draft = null, catalogBlocks = []) {
  const urls = new Set();
  const skus = new Set();
  const productIds = new Set();

  for (const block of catalogBlocks || []) {
    const text = String(block || "");
    for (const m of text.matchAll(/Ссылка:\s*(\S+)/gi)) {
      const u = normalizeUrlKey(m[1]);
      if (u.startsWith("http")) urls.add(u);
    }
    for (const m of text.matchAll(
      /(?:Артикул\s*(?:\/\s*SKU)?|SKU)\s*:\s*([^\s\n*|]+)/gi
    )) {
      const s = String(m[1] || "")
        .replace(/\*+/g, "")
        .trim();
      if (s) skus.add(s.toLowerCase());
    }
    for (const m of text.matchAll(/^\s*·\s*([A-Za-z0-9._/-]+)/gm)) {
      const s = String(m[1] || "").trim();
      if (s && /[0-9]/.test(s)) skus.add(s.toLowerCase());
    }
    for (const m of text.matchAll(/ID товара[^:]*:\s*(\d+)/gi)) {
      productIds.add(String(m[1]));
    }
  }

  for (const line of draft?.lines || []) {
    if (line.productUrl) {
      const u = normalizeUrlKey(line.productUrl);
      if (u.startsWith("http")) urls.add(u);
    }
    if (line.article) skus.add(String(line.article).trim().toLowerCase());
    if (line.sku) skus.add(String(line.sku).trim().toLowerCase());
    if (line.productId) productIds.add(String(line.productId));
  }

  return { urls, skus, productIds };
}

/**
 * One chat card from a ShopDB-backed draft line. Omits Ссылка/SKU unless real.
 */
function formatGroundedDraftCard(line = {}) {
  const productId = line.productId != null ? String(line.productId).trim() : "";
  const name = String(line.name || line.requestedName || "").trim();
  if (!name) return null;

  if (!productId) {
    return [
      "[Каталог · purolat.com]",
      `Товар: ${line.requestedName || name}`,
      "Статус: нет подтверждённого совпадения в ShopDB",
      "Цена: по запросу",
    ].join("\n");
  }

  const price = Number(line.unitPriceNet || line.unitPrice || 0);
  const rows = [
    "[Каталог · purolat.com]",
    `Товар: ${name}`,
    price > 0 ? `Цена: ${price.toFixed(2)} RUB` : "Цена: по запросу",
    line.article ? `Артикул / SKU: ${String(line.article).trim()}` : null,
    `ID товара (shop_product.id): ${productId}`,
    // Ссылка only when ShopDB gave a URL — never invent /product/{fakeSku}.
    line.productUrl && /^https?:\/\//i.test(String(line.productUrl))
      ? `Ссылка: ${String(line.productUrl).trim()}`
      : null,
  ].filter(Boolean);
  return rows.join("\n");
}

/**
 * Build chat catalog cards only from SQL-backed draft / enrich blocks.
 */
function buildGroundedCatalogCardsFromDraft(draft = null, catalogBlocks = []) {
  const lines = Array.isArray(draft?.lines) ? draft.lines : [];
  const matched = lines.filter(
    (l) =>
      l &&
      l.productId &&
      (l.matchType === "exact" ||
        l.matchType === "analog" ||
        Number(l.unitPriceNet || 0) > 0)
  );

  if (matched.length) {
    return matched
      .map((l) => formatGroundedDraftCard(l))
      .filter(Boolean)
      .join("\n\n");
  }

  const blocks = (catalogBlocks || [])
    .map((b) => String(b || "").trim())
    .filter(
      (b) =>
        /\[Каталог\s*·/i.test(b) &&
        (/ID товара/i.test(b) || /Ссылка:\s*https?:\/\//i.test(b))
    );
  if (!blocks.length) return "";
  return blocks.join("\n\n");
}

function stripLlmCatalogSections(text = "") {
  let t = String(text || "");
  t = t.replace(
    /\n?\[Каталог\s*·[^\]]*\][\s\S]*?(?=\n\[Каталог\s*·|\n#{1,3}\s|\n---\s*\n|\n\n_Источник:|$)/gi,
    "\n"
  );
  t = t.replace(
    /(?:(?:^|\n)\s*(?:\*\*)?Товар\s*:[^\n]*(?:\n\s*(?:\*\*)?(?:Цена|Артикул\s*\/\s*SKU|Артикул|Категория|Ссылка|Характеристики|ID товара|Статус)[^\n]*)*)+/gi,
    "\n"
  );
  t = t.replace(/\n_Источник:\s*каталог[^\n]*/gi, "\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function chatHasInventedCatalogFacts(text = "", allowed = null) {
  const facts = allowed || collectAllowedCatalogFacts(null, []);
  const body = String(text || "");
  if (!/Товар\s*:/i.test(body) && !/\[Каталог\s*·/i.test(body)) {
    return false;
  }

  for (const m of body.matchAll(/Ссылка\s*:\s*(\S+)/gi)) {
    const u = normalizeUrlKey(m[1]);
    if (!u.startsWith("http")) continue;
    if (!facts.urls.has(u)) return true;
  }

  for (const m of body.matchAll(
    /Артикул\s*(?:\/\s*SKU)?\s*:\s*([^\s\n*|]+)/gi
  )) {
    const sku = String(m[1] || "")
      .replace(/\*+/g, "")
      .trim()
      .toLowerCase();
    if (!sku) continue;
    if (facts.skus.size > 0 && !facts.skus.has(sku)) return true;
    // No allowed SKUs from ShopDB this turn → any LLM SKU is invented.
    if (facts.skus.size === 0) return true;
  }

  return false;
}

/**
 * Replace LLM-narrated catalog cards with ShopDB-only cards.
 * Hard rule: never leave invented Ссылка / SKU in the assistant reply.
 */
function replaceHallucinatedCatalogInChat(
  text = "",
  { draft = null, catalogBlocks = [] } = {}
) {
  const grounded = buildGroundedCatalogCardsFromDraft(draft, catalogBlocks);
  const allowed = collectAllowedCatalogFacts(draft, catalogBlocks);
  const body = String(text || "");
  const hasCards = /Товар\s*:/i.test(body) || /\[Каталог\s*·/i.test(body);
  if (!hasCards && !grounded) return body;

  const invented = chatHasInventedCatalogFacts(body, allowed);
  if (!invented && !grounded) return body;
  if (!invented && grounded && !hasCards) {
    return body;
  }

  if (!grounded) {
    const cleaned = stripLlmCatalogSections(body);
    return (
      `${cleaned}\n\n` +
      "Карточки каталога с неподтверждёнными ссылками/SKU удалены. " +
      "Цены и URL только из ShopDB (MySQL)."
    ).trim();
  }

  const preface = stripLlmCatalogSections(body);
  const parts = [];
  if (preface) parts.push(preface);
  parts.push(grounded);
  parts.push(
    "_Источник: каталог purolat.com (MySQL: shop_product, shop_product_skus)._"
  );
  return parts.join("\n\n").trim();
}

module.exports = {
  renderGroundedCatalogResponse,
  sanitizeOfferKpHistory,
  shouldRenderCatalogDirectly,
  isMultiLineInquiry,
  buildGroundedCatalogCardsFromDraft,
  replaceHallucinatedCatalogInChat,
  collectAllowedCatalogFacts,
  chatHasInventedCatalogFacts,
  formatGroundedDraftCard,
};
