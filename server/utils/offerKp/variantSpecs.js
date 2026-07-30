"use strict";

/**
 * Price-differentiating fastener variants that an RFQ line often omits.
 *
 * The same standard + size exists in ShopDB as several variants — strength
 * class (кл.пр.8 / 8.8 / 10.9) and material (carbon steel vs нерж A2/A4) — and
 * their prices differ severalfold (DIN 934 M16: 7.54 … 50.05 RUB). When the
 * request does not name the class/material, picking any single variant and
 * calling it `exact` quotes an arbitrary price, so such lines must abstain
 * (needs_review) instead. Deterministic: regex over names, no LLM.
 */

const NON_ALNUM = "[^\\p{L}\\p{N}]";

// «кл.пр.8», «кл. прочности 10», «class 8.8»
const LABELED_CLASS_RE = new RegExp(
  `(?:^|${NON_ALNUM})(?:кл\\.?\\s*(?:пр\\.?|прочн\\p{L}*)?|class)\\s*(\\d{1,2}(?:[.,]\\d)?)(?:$|${NON_ALNUM})`,
  "iu"
);

// Bare bolt class «8.8», «10.9». Pitch («M10x1.5») cannot match: the digit is
// preceded by «x», which is a letter, so the leading boundary fails.
const BARE_CLASS_RE = new RegExp(
  `(?:^|${NON_ALNUM})(\\d{1,2}[.,]\\d)(?:$|${NON_ALNUM})`,
  "u"
);

// «нерж», «A2», «А4» (Cyrillic А too), «inox». JS \b is ASCII-only — never use
// it around Cyrillic.
const STAINLESS_RE = new RegExp(
  `(?:^|${NON_ALNUM})(?:нерж\\p{L}*|inox|stainless|[aа][24])(?:$|${NON_ALNUM})`,
  "iu"
);

const CARBON_STEEL = "сталь";
const STAINLESS = "нерж";

function normalizeClass(value) {
  return String(value || "")
    .replace(",", ".")
    .trim();
}

/**
 * @param {string} text inquiry line or catalog product name
 * @returns {string} "" | "8" | "8.8" | "10.9" …
 */
function extractStrengthClass(text) {
  const raw = String(text || "");
  const labeled = raw.match(LABELED_CLASS_RE);
  if (labeled) return normalizeClass(labeled[1]);
  const bare = raw.match(BARE_CLASS_RE);
  if (bare) return normalizeClass(bare[1]);
  return "";
}

/** @returns {boolean} name/query declares stainless steel */
function isStainless(text) {
  return STAINLESS_RE.test(String(text || ""));
}

/**
 * @param {string} text
 * @returns {{strengthClass: string, material: string}} material is "" when the
 *   text is silent about it (a query), never guessed as carbon steel.
 */
function variantSpecs(text) {
  return {
    strengthClass: extractStrengthClass(text),
    material: isStainless(text) ? STAINLESS : "",
  };
}

/**
 * Grouping key for cheapest-within-signature selection: a cheaper class-8 nut
 * is not a cheaper variant of a class-10 nut.
 * @param {string} name catalog product name
 * @returns {string}
 */
function variantPricingKey(name) {
  const specs = variantSpecs(name);
  return `${specs.strengthClass}|${specs.material || CARBON_STEEL}`;
}

function priceSpreadThreshold() {
  const configured = Number(process.env.OFFER_KP_VARIANT_PRICE_SPREAD);
  return Number.isFinite(configured) && configured > 1 ? configured : 1.2;
}

/**
 * Underspecified request + catalog variants that disagree on a
 * price-differentiating spec → no automatic exact/price.
 *
 * @param {{queryText: string, alternatives?: Array<{name?: string, price?: number|string, matchType?: string}>}} input
 * @returns {{field: "strengthClass"|"material", values: string[], minPrice: number, maxPrice: number}|null}
 */
function detectVariantAmbiguity({ queryText, alternatives = [] } = {}) {
  const query = variantSpecs(queryText);
  const pool = (alternatives || []).filter(
    (alt) =>
      alt &&
      (alt.matchType === "exact" || alt.matchType === "analog") &&
      Number(alt.price) > 0
  );
  if (pool.length < 2) return null;

  const rows = pool.map((alt) => ({
    price: Number(alt.price),
    ...variantSpecs(alt.name || ""),
  }));

  for (const field of ["strengthClass", "material"]) {
    if (query[field]) continue; // request pinned the spec — matching enforces it
    const buckets = new Map();
    for (const row of rows) {
      // Silence about material means carbon steel; silence about class is
      // simply unknown and cannot prove a variant difference.
      const value =
        field === "material" ? row.material || CARBON_STEEL : row.strengthClass;
      if (!value) continue;
      if (!buckets.has(value)) buckets.set(value, []);
      buckets.get(value).push(row.price);
    }
    if (buckets.size < 2) continue;

    const prices = [...buckets.values()].flat();
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    if (minPrice > 0 && maxPrice / minPrice >= priceSpreadThreshold()) {
      return {
        field,
        values: [...buckets.keys()].sort(),
        minPrice,
        maxPrice,
      };
    }
  }
  return null;
}

module.exports = {
  CARBON_STEEL,
  STAINLESS,
  extractStrengthClass,
  isStainless,
  variantSpecs,
  variantPricingKey,
  detectVariantAmbiguity,
  priceSpreadThreshold,
};
