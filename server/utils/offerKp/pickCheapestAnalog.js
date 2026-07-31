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

function isOutOfStockLine(line = {}) {
  if (!line || typeof line !== "object") return false;
  if ((Number(line.stockCount) || 0) > 0) return false;
  return /нет\s*в\s*наличии|out\s*of\s*stock|brak\s*w\s*magazynie|niedostęp/i.test(
    String(line.status || "")
  );
}

function positiveAltPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function altNetPrice(alt = {}) {
  if (!alt || typeof alt !== "object") return 0;
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
 * @returns {'already_best'|'out_of_stock'|'no_menu'|'no_priced_stock'|'empty'}
 */
function explainCheapestAnalogsEmpty(lines = []) {
  const rows = (lines || []).filter((line) => line && typeof line === "object");
  if (!rows.length) return "empty";

  let anyMenu = false;
  let anyPricedStock = false;
  let anyAlreadyBest = false;

  for (const line of rows) {
    const alts = Array.isArray(line.alternatives) ? line.alternatives : [];
    if (alts.length < 2) continue;
    anyMenu = true;
    const alt = pickCheapestAnalog(alts);
    if (!alt) continue;
    anyPricedStock = true;
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
    if ((sameSku || sameId) && !priceNeedsUpdate) {
      anyAlreadyBest = true;
    }
  }

  if (anyAlreadyBest && !resolveCheapestAnalogsForLines(rows).length) {
    return "already_best";
  }
  if (rows.every(isOutOfStockLine)) return "out_of_stock";
  if (!anyMenu) return "no_menu";
  if (!anyPricedStock) {
    if (rows.some(isOutOfStockLine)) return "out_of_stock";
    return "no_priced_stock";
  }
  return "no_priced_stock";
}

/**
 * Patch applied to a draft line when selecting a menu alternative (same as UI).
 */
function altPatchForLine(alt = {}, vatRate = 0.2) {
  if (!alt || typeof alt !== "object") {
    return {
      name: "",
      article: "",
      sku: "",
      matchType: "analog",
      unitPriceNet: 0,
      priceWithVat: 0,
      weightKg: 0,
      status: "Аналог",
      kpStatus: "Предложен аналог",
      analogOf: null,
      stockCount: 0,
      allowPrice: false,
    };
  }
  const unitPriceNet = altNetPrice(alt);
  const inStock = isInStockAlternative(alt);
  const status =
    alt.status ||
    (inStock ? "В наличии" : alt.matchType === "analog" ? "Аналог" : "Аналог");
  const weightKg =
    alt.weightKg != null && Number.isFinite(Number(alt.weightKg))
      ? Number(alt.weightKg)
      : 0;
  return {
    name: alt.name || "",
    article: alt.sku,
    sku: alt.sku,
    productId: alt.productId || undefined,
    matchType: alt.matchType || "analog",
    unitPriceNet: Number(unitPriceNet.toFixed(2)),
    priceWithVat: Number((unitPriceNet * (1 + vatRate)).toFixed(2)),
    weightKg,
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
  isOutOfStockLine,
  positiveAltPrice,
  altNetPrice,
  pickCheapestAnalog,
  resolveCheapestAnalogsForLines,
  explainCheapestAnalogsEmpty,
  altPatchForLine,
};
