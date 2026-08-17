"use strict";

/**
 * ShopDB / purolat.com SKU prices already include VAT.
 * Quote «Цена» is the catalog number — never add 20% on top.
 */

function catalogGross(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Number(n.toFixed(2));
}

module.exports = { catalogGross };
