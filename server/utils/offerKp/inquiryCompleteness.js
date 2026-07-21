"use strict";

/**
 * Minimum-information policy: decide whether an inquiry line has enough
 * catalog signals to search, or should abstain before retrieval.
 */

const { parseHardwareQuery } = require("./hardwareQuery");

const SKU_RE =
  /(?:арт\.?|art\.?|sku)\s*[:№#-]?\s*([0-9]{6,})|\b([0-9]{9,})\b/i;

/**
 * @param {{ raw?: string, name?: string, thread?: object|null }} inquiryLine
 * @returns {{
 *   ok: boolean,
 *   missing: string[],
 *   parsed: object,
 *   hasSku: boolean,
 * }}
 */
function assessInquiryCompleteness(inquiryLine = {}) {
  const text = String(inquiryLine.raw || inquiryLine.name || "").trim();
  const parsed = parseHardwareQuery(text);
  const skuMatch = text.match(SKU_RE);
  const hasSku = !!(skuMatch && (skuMatch[1] || skuMatch[2]));
  const hasThread = !!(
    parsed.thread ||
    inquiryLine.thread ||
    parsed.dimensions
  );
  const hasStandard = !!(parsed.dinNumbers || []).length;
  const hasType = !!(parsed.productTypes || []).length;

  if (hasSku) {
    return { ok: true, missing: [], parsed, hasSku: true };
  }

  const missing = [];
  // Fastener-like lines: type/standard without any size → underspecified.
  const looksLikeFastener =
    hasType ||
    hasStandard ||
    /\b(болт|гайк|винт|шайб|анкер|bolt|nut|screw|washer)\b/i.test(text);

  if (looksLikeFastener && !hasThread) {
    missing.push("size");
  }

  // Totally empty of catalog markers — do not search.
  if (!hasThread && !hasStandard && !hasType && text.length < 12) {
    missing.push("product_signal");
  }

  // Diameter without length for bolts/screws (e.g. "болт м10 100 шт").
  const diameterOnly =
    !parsed.thread &&
    /\bm\s*\d+\b/i.test(text) &&
    !/\bm\s*\d+\s*[x×х]\s*\d+/i.test(text);
  if (looksLikeFastener && diameterOnly) {
    if (!missing.includes("size")) missing.push("length");
  }

  const ok = missing.length === 0;
  return { ok, missing, parsed, hasSku: false };
}

module.exports = { assessInquiryCompleteness, SKU_RE };
