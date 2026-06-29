"use strict";

/**
 * Цена в Webasyst часто лежит в shop_product_skus, а shop_product.price = 0.
 */

function pickPositiveNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * @param {object|null|undefined} product
 * @param {object[]} [skuRows]
 * @returns {number}
 */
function resolveProductPrice(product, skuRows = []) {
  const direct = pickPositiveNumber(product?.price, product?.compare_price);
  if (direct > 0) return direct;

  for (const sk of skuRows || []) {
    const skuPrice = pickPositiveNumber(sk?.price, sk?.compare_price);
    if (skuPrice > 0) return skuPrice;
  }

  return 0;
}

module.exports = {
  pickPositiveNumber,
  resolveProductPrice,
};
