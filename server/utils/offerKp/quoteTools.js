"use strict";

/**
 * Atomic deterministic tools for OfferKP quote path.
 * LLM may choose *which* tool; each tool itself is deterministic.
 */

const { parseInquiryText } = require("./parseInquiry");
const {
  matchInquiryLine,
  matchInquiryToDraft,
  buildDraftFromMatchedLines,
} = require("./matchInquiryLines");
const { resolveProductPrice } = require("./priceResolve");
const {
  validateQuotePricesFromDb,
  sanitizeQuotePricesToShopDb,
} = require("./quoteDbPriceGate");
const { assertExportGuards, stripIllegalPrices } = require("./exportGuards");
const {
  buildLineEvidence,
  attachDraftEvidence,
  PRICE_ELIGIBLE_MATCH_TYPES,
} = require("./matchEvidence");
const { searchByExactSku } = require("./productSearchAgent");

/**
 * @param {string} inquiryText
 */
function extractInquiryLines(inquiryText) {
  return parseInquiryText(inquiryText);
}

/**
 * Resolve live ShopDB price for an exact SKU. Never invents.
 * @param {string} sku
 */
async function resolveShopDbPrice(sku) {
  const hits = await searchByExactSku([String(sku || "").trim()], 1);
  if (!hits.length) return { sku, productId: null, price: null, found: false };
  const product = hits[0];
  const price = resolveProductPrice(product);
  return {
    sku: String(sku),
    productId: String(product.id),
    price: Number(price) > 0 ? Number(price) : null,
    found: true,
    name: product.name || null,
  };
}

/**
 * Classify whether a match type may carry a catalog price.
 * @param {string} matchType
 */
function classifyMatch(matchType) {
  const type = String(matchType || "none");
  return {
    matchType: type,
    allowPrice: PRICE_ELIGIBLE_MATCH_TYPES.includes(type),
  };
}

/**
 * @param {string} content
 * @param {{ draft?: object, catalogBlocks?: string[] }} [opts]
 */
function verifyQuote(content, opts = {}) {
  const priceGate = validateQuotePricesFromDb(content, opts);
  const exportGate = assertExportGuards({
    draft: opts.draft,
    sourceLines: opts.sourceLines,
    quoteLines: opts.draft?.lines,
  });
  return {
    ok: priceGate.ok && exportGate.ok,
    priceGate,
    exportGate,
  };
}

/**
 * Sanitize markdown quote content to ShopDB-only prices.
 */
function sanitizeQuote(content, opts = {}) {
  return sanitizeQuotePricesToShopDb(content, opts);
}

module.exports = {
  extractInquiryLines,
  matchInquiryLine,
  matchInquiryToDraft,
  buildDraftFromMatchedLines,
  resolveShopDbPrice,
  classifyMatch,
  verifyQuote,
  sanitizeQuote,
  assertExportGuards,
  stripIllegalPrices,
  buildLineEvidence,
  attachDraftEvidence,
  searchByExactSku,
};
