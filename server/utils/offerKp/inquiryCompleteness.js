"use strict";

/**
 * Minimum-information policy: decide whether an inquiry line has enough
 * catalog signals to search, or should abstain before retrieval.
 */

const { parseHardwareQuery } = require("./hardwareQuery");

const SKU_RE =
  /(?:арт\.?|art\.?|sku)\s*[:№#-]?\s*([0-9]{6,})|\b([0-9]{9,})\b/i;

/** Product types that need diameter×length (thread or pin dimensions). */
const LENGTH_REQUIRED_TYPES = new Set([
  "болт",
  "винт",
  "анкер",
  "штифт",
  "шпилька",
]);

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
  const hasThread = !!(parsed.thread || inquiryLine.thread);
  // Pin / bar stock "6x30", "14x32" — both diameter and length.
  const hasPinDims = !!(
    parsed.dimensions &&
    parsed.dimensions.a &&
    parsed.dimensions.b
  );
  const hasDiameter = !!(parsed.diameter || hasPinDims);
  const hasSize = hasThread || hasDiameter || hasPinDims;
  const hasStandard = !!(parsed.dinNumbers || []).length;
  const hasType = !!(parsed.productTypes || []).length;

  if (hasSku) {
    return { ok: true, missing: [], parsed, hasSku: true };
  }

  const missing = [];
  const looksLikeFastener =
    hasType ||
    hasStandard ||
    /\b(болт|гайк|винт|шайб|анкер|штифт|шпильк|рым|bolt|nut|screw|washer|pin)\b/i.test(
      text
    );

  if (looksLikeFastener && !hasSize) {
    missing.push("size");
  }

  // Totally empty of catalog markers — do not search.
  if (!hasSize && !hasStandard && !hasType && text.length < 12) {
    missing.push("product_signal");
  }

  // Bolts/screws/pins: diameter alone (M10 / bare number) without length is
  // underspecified. Pin DxL dimensions (6x30) already include length.
  const needsLength =
    (parsed.productTypes || []).some((t) => LENGTH_REQUIRED_TYPES.has(t)) ||
    (!hasType &&
      /\b(болт|винт|анкер|штифт|шпильк|bolt|screw|anchor|pin)\b/i.test(text));

  if (
    looksLikeFastener &&
    needsLength &&
    !hasThread &&
    !hasPinDims &&
    hasDiameter &&
    !parsed.pitch
  ) {
    if (!missing.includes("length")) missing.push("length");
  }

  const ok = missing.length === 0;
  return { ok, missing, parsed, hasSku: false };
}

module.exports = {
  assessInquiryCompleteness,
  SKU_RE,
  LENGTH_REQUIRED_TYPES,
};
