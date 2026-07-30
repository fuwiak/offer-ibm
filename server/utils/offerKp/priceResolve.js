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
 * @param {object} product
 * @param {object[]} skuRows — when resolving a chosen SKU, pass [chosenSku] only
 * @param {object[]} optPriceRows
 * @returns {{ price: number, source: string|null }}
 */
function resolveProductPriceWithSource(
  product,
  skuRows = [],
  optPriceRows = []
) {
  // Prefer first SKU row with a positive price — callers must pass the *chosen*
  // SKU alone (or ordered so the intended row is first).
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
function resolveProductPrice(product, skuRows = [], optPriceRows = []) {
  return resolveProductPriceWithSource(product, skuRows, optPriceRows).price;
}

module.exports = {
  pickPositiveNumber,
  configuredOptPriceCategoryId,
  resolveSkuRowPrice,
  resolveProductPrice,
  resolveProductPriceWithSource,
};
