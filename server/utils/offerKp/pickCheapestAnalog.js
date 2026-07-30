"use strict";

/**
 * Pick an alternative from the same list as the draft-table «Аналоги» menu.
 * Mirror of frontend/src/utils/offerKp/pickCheapestAnalog.js (ShopDB-only prices).
 */

function isAnalogAlternative(alt = {}) {
  if (!alt || typeof alt !== "object") return false;
  if (alt.matchType === "analog") return true;
  return /аналог|analog|zamiennik/i.test(String(alt.status || ""));
}

function isInStockAlternative(alt = {}) {
  if (!alt || typeof alt !== "object") return false;
  if ((Number(alt.stockCount) || 0) > 0) return true;
  return /в\s*наличии|in\s*stock|na\s*stanie|dostęp/i.test(
    String(alt.status || "")
  );
}

function positiveAltPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function altNetPrice(alt = {}) {
  return (
    positiveAltPrice(alt.price) ||
    positiveAltPrice(alt.unitPriceNet) ||
    positiveAltPrice(alt.unitPrice) ||
    0
  );
}

function pickCheapestAnalog(alternatives = []) {
  const list = (alternatives || []).filter(Boolean);
  if (!list.length) return null;

  const candidates = list.filter(
    (alt) => isInStockAlternative(alt) && altNetPrice(alt) > 0
  );
  if (!candidates.length) return null;

  return [...candidates]
    .map((alt, menuIndex) => ({ alt, menuIndex }))
    .sort((a, b) => {
      const priceDelta = altNetPrice(a.alt) - altNetPrice(b.alt);
      if (priceDelta) return priceDelta;
      const stockDelta =
        (Number(b.alt.stockCount) || 0) - (Number(a.alt.stockCount) || 0);
      if (stockDelta) return stockDelta;
      return a.menuIndex - b.menuIndex;
    })[0].alt;
}

function lineNetPrice(line = {}) {
  const net = Number(line.unitPriceNet);
  if (Number.isFinite(net) && net > 0) return net;
  return positiveAltPrice(line.price) || 0;
}

/**
 * @returns {{ index: number, alt: object, line: object }[]}
 */
function resolveCheapestAnalogsForLines(lines = []) {
  const picks = [];
  (lines || []).forEach((line, index) => {
    const alts = line?.alternatives;
    if (!Array.isArray(alts) || alts.length < 2) return;
    const alt = pickCheapestAnalog(alts);
    if (!alt) return;
    const currentSku = String(line.article || line.sku || "").trim();
    const nextSku = String(alt.sku || "").trim();
    const currentId = String(line.productId || "").trim();
    const nextId = String(alt.productId || "").trim();
    const sameSku = Boolean(currentSku && nextSku && currentSku === nextSku);
    const sameId = Boolean(currentId && nextId && currentId === nextId);
    const nextNet = altNetPrice(alt);
    const currentNet = lineNetPrice(line);
    const priceNeedsUpdate =
      nextNet > 0 && Math.abs(currentNet - nextNet) >= 0.005;
    if ((sameSku || sameId) && !priceNeedsUpdate) return;
    picks.push({ index, alt, line });
  });
  return picks;
}

/**
 * Patch applied to a draft line when selecting a menu alternative (same as UI).
 */
function altPatchForLine(alt = {}, vatRate = 0.2) {
  const unitPriceNet = altNetPrice(alt);
  const inStock = isInStockAlternative(alt);
  const status =
    alt.status ||
    (inStock ? "В наличии" : alt.matchType === "analog" ? "Аналог" : "Аналог");
  return {
    name: alt.name,
    article: alt.sku,
    sku: alt.sku,
    productId: alt.productId || undefined,
    matchType: alt.matchType || "analog",
    unitPriceNet: Number(unitPriceNet.toFixed(2)),
    priceWithVat: Number((unitPriceNet * (1 + vatRate)).toFixed(2)),
    status,
    kpStatus:
      alt.matchType === "exact" && inStock
        ? "Точное соответствие"
        : "Предложен аналог",
    analogOf: alt.analogOf,
    stockCount: Number(alt.stockCount) || 0,
    allowPrice: unitPriceNet > 0,
  };
}

module.exports = {
  isAnalogAlternative,
  isInStockAlternative,
  positiveAltPrice,
  altNetPrice,
  pickCheapestAnalog,
  resolveCheapestAnalogsForLines,
  altPatchForLine,
};
