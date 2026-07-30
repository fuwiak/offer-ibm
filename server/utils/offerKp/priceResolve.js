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

function configuredOptPriceCategoryId() {
  const id = Number(process.env.SHOP_DB_OPT_PRICE_USER_CATEGORY_ID);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function resolveProductPriceWithSource(
  product,
  skuRows = [],
  optPriceRows = []
) {
  for (const sk of skuRows || []) {
    const skuPrice = pickPositiveNumber(sk?.price);
    if (skuPrice > 0) {
      return { price: skuPrice, source: "shop_product_skus.price" };
    }
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
  resolveProductPrice,
  resolveProductPriceWithSource,
};
