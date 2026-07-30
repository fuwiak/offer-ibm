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

/**
 * Webasyst storefront URLs are /shop/{category}/{slug}/ — never /product/{sku}.
 * LLM freely invents https://purolat.com/product/{артикул}; treat as always fake.
 */
function isFabricatedShopUrl(url = "") {
  const u = normalizeUrlKey(url);
  if (!u) return false;
  if (/\/product\//i.test(u)) return true;
  if (/purolat\.com\/product(?:\/|\?|#|$)/i.test(u)) return true;
  return false;
}

const {
  isFabricatedSku,
  sanitizeSku,
  stripFabricatedSkusFromText,
  stripFabricatedSkusFromLines,
  stripUngroundedSkusFromText,
  stripUngroundedSkusFromLines,
  isGroundedSku,
  groundSku,
  lineMayCarrySku,
} = require("./fabricatedSku");

/**
 * Drop invented /product/{sku} URLs + any SKU not in ShopDB allowlist.
 * @param {string} text
 * @param {Set<string>|string[]|null|undefined} [allowedSkus]
 */
function stripFabricatedProductLinks(text = "", allowedSkus = null) {
  let t = String(text || "");
  t = t.replace(
    /^[^\n]*Ссылка\s*:\s*https?:\/\/[^\n]*\/product\/[^\n]*$/gim,
    ""
  );
  t = t.replace(/\[([^\]]*)\]\(https?:\/\/[^)]*\/product\/[^)]*\)/gi, "$1");
  t = t.replace(/https?:\/\/[^\s)\]]*\/product\/[^\s)\]]*/gi, "");
  // Fail closed: when allowlist provided (even empty), strip ungrounded SKUs.
  t =
    allowedSkus == null
      ? stripFabricatedSkusFromText(t)
      : stripUngroundedSkusFromText(t, allowedSkus);
  return t
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
      // Never trust /product/{sku} even if it leaked into an enrich block.
      if (u.startsWith("http") && !isFabricatedShopUrl(u)) urls.add(u);
    }
    for (const m of text.matchAll(
      /(?:Артикул\s*(?:\/\s*SKU)?|SKU)\s*:\s*([^\s\n*|]+)/gi
    )) {
      const s = sanitizeSku(m[1]);
      if (s) skus.add(s.toLowerCase());
    }
    for (const m of text.matchAll(/^\s*·\s*([A-Za-z0-9._/-]+)/gm)) {
      const s = sanitizeSku(m[1]);
      if (s && /[0-9]/.test(s)) skus.add(s.toLowerCase());
    }
    for (const m of text.matchAll(/ID товара[^:]*:\s*(\d+)/gi)) {
      productIds.add(String(m[1]));
    }
  }

  for (const line of draft?.lines || []) {
    if (line.productUrl) {
      const u = normalizeUrlKey(line.productUrl);
      if (u.startsWith("http") && !isFabricatedShopUrl(u)) urls.add(u);
    }
    // Only exact/analog + productId lines contribute grounded SKUs.
    if (!lineMayCarrySku(line)) continue;
    const article = sanitizeSku(line.article);
    const sku = sanitizeSku(line.sku);
    if (article) skus.add(article.toLowerCase());
    if (sku) skus.add(sku.toLowerCase());
    if (line.productId) productIds.add(String(line.productId));
  }

  return { urls, skus, productIds };
}

/**
 * Absolute shop URL from draft/SQL fields. Draft often stores only the
 * product slug (shop_product.url) — never invent /product/{sku}.
 */
function resolvePublicProductUrl(line = {}) {
  const raw = String(line.productUrl || line.url || "").trim();
  if (/^https?:\/\//i.test(raw)) {
    return isFabricatedShopUrl(raw) ? "" : raw;
  }
  try {
    const { buildProductUrl, getShopBaseUrl } = require("./productUrl");
    const slug = raw && !raw.includes("://") ? raw : "";
    const categoryUrl = String(
      line.categoryUrl || line.category_url || ""
    ).trim();
    if (!slug && !categoryUrl) return "";
    // Never build from a slug that is clearly a /product/ path fragment.
    if (/^product\//i.test(slug)) return "";
    const built = buildProductUrl(getShopBaseUrl(), categoryUrl, slug);
    return isFabricatedShopUrl(built) ? "" : built;
  } catch {
    return "";
  }
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
  const publicUrl = resolvePublicProductUrl(line);
  const safeName = String(name).replace(/\[/g, "(").replace(/\]/g, ")");
  const article = lineMayCarrySku(line)
    ? sanitizeSku(line.article || line.sku)
    : "";
  const rows = [
    "[Каталог · purolat.com]",
    publicUrl ? `Товар: [${safeName}](${publicUrl})` : `Товар: ${name}`,
    price > 0 ? `Цена: ${price.toFixed(2)} RUB` : "Цена: по запросу",
    article ? `Артикул / SKU: ${article}` : null,
    `ID товара (shop_product.id): ${productId}`,
    // Bare URL kept for price/SKU harness parsers; markdown linkify + Товар link for UI.
    publicUrl ? `Ссылка: ${publicUrl}` : null,
  ].filter(Boolean);
  return rows.join("\n");
}

function findCatalogBlockForLine(line = {}, catalogBlocks = []) {
  const blocks = (catalogBlocks || [])
    .map((b) => String(b || "").trim())
    .filter((b) => /\[Каталог\s*·/i.test(b));
  const productId = line.productId != null ? String(line.productId).trim() : "";
  if (productId) {
    const byId = blocks.find((b) =>
      new RegExp(`ID товара[^:\\n]*:\\s*${productId}\\b`, "i").test(b)
    );
    if (byId) return byId;
  }
  const nameKey = String(line.name || line.requestedName || "")
    .toLowerCase()
    .replace(/[×х]/gi, "x")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  if (nameKey.length >= 12) {
    return (
      blocks.find((b) =>
        b.toLowerCase().replace(/[×х]/gi, "x").includes(nameKey.slice(0, 28))
      ) || null
    );
  }
  return null;
}

/**
 * Build chat catalog cards for every draft line (matched + stubs).
 * Prefer SQL enrich blocks (real Ссылка); else format from draft fields.
 */
function buildGroundedCatalogCardsFromDraft(draft = null, catalogBlocks = []) {
  const lines = Array.isArray(draft?.lines) ? draft.lines : [];
  const blocks = (catalogBlocks || [])
    .map((b) => String(b || "").trim())
    .filter(
      (b) =>
        /\[Каталог\s*·/i.test(b) &&
        (/ID товара/i.test(b) || /Ссылка:\s*https?:\/\//i.test(b))
    );

  if (!lines.length) {
    return blocks.join("\n\n");
  }

  const cards = lines.map((line) => {
    const block = findCatalogBlockForLine(line, blocks);
    if (block) return block;
    return formatGroundedDraftCard(line);
  });

  return cards.filter(Boolean).join("\n\n");
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
    // Still catch bare /product/{sku} URLs outside card markup.
    for (const m of body.matchAll(/https?:\/\/[^\s)\]]+/gi)) {
      if (isFabricatedShopUrl(m[0])) return true;
    }
    return false;
  }

  // Hard ban: any /product/{sku} (Ссылка, markdown, or bare).
  for (const m of body.matchAll(/https?:\/\/[^\s)\]]+/gi)) {
    if (isFabricatedShopUrl(m[0])) return true;
  }

  for (const m of body.matchAll(/Ссылка\s*:\s*(\S+)/gi)) {
    const u = normalizeUrlKey(m[1]);
    if (!u.startsWith("http")) continue;
    if (isFabricatedShopUrl(u) || !facts.urls.has(u)) return true;
  }

  for (const m of body.matchAll(
    /Артикул\s*(?:\/\s*SKU)?\s*:\s*([^\s\n*|]+)/gi
  )) {
    const sku = String(m[1] || "")
      .replace(/\*+/g, "")
      .trim()
      .toLowerCase();
    if (!sku) continue;
    if (isFabricatedSku(sku)) return true;
    if (facts.skus.size > 0 && !facts.skus.has(sku)) return true;
    // No allowed SKUs from ShopDB this turn → any LLM SKU is invented.
    if (facts.skus.size === 0) return true;
  }

  // prompts.js template (Товар/Цена/Категория/Характеристики) without
  // shop_product.id → LLM narration, not enrich/SQL cards.
  if (
    /Товар\s*:/i.test(body) &&
    /Цена\s*:/i.test(body) &&
    !/ID товара/i.test(body) &&
    (/Категория\s*:/i.test(body) ||
      /Характеристики\s*:/i.test(body) ||
      /Ссылка\s*:/i.test(body))
  ) {
    return true;
  }

  return false;
}

/**
 * Replace LLM-narrated catalog cards with ShopDB-only cards.
 * Hard rule: never leave invented Ссылка / SKU in the assistant reply.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.injectDraftCards=true] When false (system_help /
 *   document_question / casual), strip invented cards but never dump the
 *   previous quote draft into the reply.
 */
function replaceHallucinatedCatalogInChat(
  text = "",
  { draft = null, catalogBlocks = [], injectDraftCards = true } = {}
) {
  const grounded = injectDraftCards
    ? buildGroundedCatalogCardsFromDraft(draft, catalogBlocks)
    : "";
  const allowed = collectAllowedCatalogFacts(
    injectDraftCards ? draft : null,
    injectDraftCards ? catalogBlocks : []
  );
  const body = String(text || "");
  const hasCards = /Товар\s*:/i.test(body) || /\[Каталог\s*·/i.test(body);
  const hasFabricatedUrl = /https?:\/\/[^\s)\]]*\/product\//i.test(body);

  if (!injectDraftCards) {
    if (!hasCards && !hasFabricatedUrl) {
      return stripFabricatedProductLinks(body, allowed.skus);
    }
    return stripFabricatedProductLinks(
      stripLlmCatalogSections(body),
      allowed.skus
    );
  }

  if (!hasCards && !grounded) {
    return stripFabricatedProductLinks(body, allowed.skus);
  }

  const invented =
    chatHasInventedCatalogFacts(body, allowed) || hasFabricatedUrl;
  if (!invented && !grounded) {
    return stripFabricatedProductLinks(body, allowed.skus);
  }
  if (!invented && grounded && !hasCards) {
    return stripFabricatedProductLinks(body, allowed.skus);
  }

  if (!grounded) {
    const cleaned = stripFabricatedProductLinks(
      stripLlmCatalogSections(body),
      allowed.skus
    );
    return (
      `${cleaned}\n\n` +
      "Карточки каталога с неподтверждёнными ссылками/SKU удалены. " +
      "Цены и URL только из ShopDB (MySQL)."
    ).trim();
  }

  const preface = stripFabricatedProductLinks(
    stripLlmCatalogSections(body),
    allowed.skus
  );
  const parts = [];
  if (preface) parts.push(preface);
  // Grounded cards already come from ShopDB — pass their SKUs as allowlist.
  parts.push(stripFabricatedProductLinks(grounded, allowed.skus));
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
  resolvePublicProductUrl,
  isFabricatedShopUrl,
  stripFabricatedProductLinks,
  isFabricatedSku,
  sanitizeSku,
  isGroundedSku,
  groundSku,
  lineMayCarrySku,
  stripFabricatedSkusFromText,
  stripFabricatedSkusFromLines,
  stripUngroundedSkusFromText,
  stripUngroundedSkusFromLines,
};
