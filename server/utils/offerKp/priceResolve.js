"use strict";

/**
 * Цена в Webasyst часто лежит в shop_product_skus, а shop_product.price = 0.
 * Always resolve price for a *specific* SKU row — never mix SKU-A with price of SKU-B.
 */

function pickPositiveNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function configuredOptPriceCategoryId() {
  const id = Number(process.env.SHOP_DB_OPT_PRICE_USER_CATEGORY_ID);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeSkuCode(sku) {
  return String(sku || "").trim();
}

/**
 * Find one SKU row by exact article code (case-sensitive trim match).
 * @param {object[]} skuRows
 * @param {string} skuCode
 * @returns {object|null}
 */
function findSkuRowByCode(skuRows = [], skuCode) {
  const wanted = normalizeSkuCode(skuCode);
  if (!wanted) return null;
  const rows = Array.isArray(skuRows) ? skuRows : [];
  return (
    rows.find((row) => normalizeSkuCode(row?.sku) === wanted) || null
  );
}

/**
 * Price for one SKU row only (sku.price → opt_price on that row).
 * @param {object|null} skuRow
 * @returns {{ price: number, source: string|null }}
 */
function resolveSkuRowPrice(skuRow) {
  if (!skuRow || typeof skuRow !== "object") {
    return { price: 0, source: null };
  }
  const skuPrice = pickPositiveNumber(skuRow.price);
  if (skuPrice > 0) {
    return { price: skuPrice, source: "shop_product_skus.price" };
  }
  const optPrice = pickPositiveNumber(skuRow.opt_price);
  if (optPrice > 0) {
    return { price: optPrice, source: "shop_opt_prices.price" };
  }
  return { price: 0, source: null };
}

/**
 * Price bound to a preferred SKU code only.
 * Never falls back to a sibling / cheapest SKU.
 *
 * @param {object[]} skuRows
 * @param {string} preferredSku
 * @returns {{
 *   price: number,
 *   source: string|null,
 *   sku: string,
 *   skuRow: object|null,
 *   skuMissing: boolean,
 * }}
 */
function resolvePreferredSkuPrice(skuRows = [], preferredSku) {
  const wanted = normalizeSkuCode(preferredSku);
  if (!wanted) {
    return {
      price: 0,
      source: null,
      sku: "",
      skuRow: null,
      skuMissing: false,
    };
  }
  const skuRow = findSkuRowByCode(skuRows, wanted);
  if (!skuRow) {
    return {
      price: 0,
      source: null,
      sku: wanted,
      skuRow: null,
      skuMissing: true,
    };
  }
  const resolved = resolveSkuRowPrice(skuRow);
  return {
    price: resolved.price,
    source: resolved.source,
    sku: normalizeSkuCode(skuRow.sku) || wanted,
    skuRow,
    skuMissing: false,
  };
}

/**
 * @param {object} product
 * @param {object[]} skuRows — when resolving a chosen SKU, pass [chosenSku] only
 *   OR pass all rows + preferredSku (4th arg / options.preferredSku)
 * @param {object[]} optPriceRows
 * @param {string|{ preferredSku?: string }} [preferredSkuOrOpts]
 * @returns {{ price: number, source: string|null, skuMissing?: boolean }}
 */
function resolveProductPriceWithSource(
  product,
  skuRows = [],
  optPriceRows = [],
  preferredSkuOrOpts = null
) {
  const preferredSku =
    typeof preferredSkuOrOpts === "string"
      ? preferredSkuOrOpts
      : preferredSkuOrOpts?.preferredSku || null;

  if (normalizeSkuCode(preferredSku)) {
    const pinned = resolvePreferredSkuPrice(skuRows, preferredSku);
    return {
      price: pinned.price,
      source: pinned.source,
      skuMissing: pinned.skuMissing,
    };
  }

  // Prefer first SKU row with a positive price — callers must pass the *chosen*
  // SKU alone (or ordered so the intended row is first). Passing the full
  // sibling list without preferredSku is unsafe for exact-SKU quotes.
  for (const sk of skuRows || []) {
    const fromSku = resolveSkuRowPrice(sk);
    if (fromSku.price > 0) return fromSku;
  }

  const productPrice = pickPositiveNumber(product?.price);
  if (productPrice > 0) {
    return { price: productPrice, source: "shop_product.price" };
  }

  for (const row of optPriceRows || []) {
    const optPrice = pickPositiveNumber(row?.price);
    if (optPrice > 0) {
      return { price: optPrice, source: "shop_opt_prices.price" };
    }
  }

  return { price: 0, source: null };
}

/**
 * compare_price is deliberately excluded: in Shop-Script it is the old/list
 * price shown next to the sale price, never the current transactional price.
 */
function resolveProductPrice(
  product,
  skuRows = [],
  optPriceRows = [],
  preferredSkuOrOpts = null
) {
  return resolveProductPriceWithSource(
    product,
    skuRows,
    optPriceRows,
    preferredSkuOrOpts
  ).price;
}

module.exports = {
  pickPositiveNumber,
  configuredOptPriceCategoryId,
  normalizeSkuCode,
  findSkuRowByCode,
  resolveSkuRowPrice,
  resolvePreferredSkuPrice,
  resolveProductPrice,
  resolveProductPriceWithSource,
};
