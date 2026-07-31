/**
 * Pick an alternative from the same list as the draft-table «Аналоги» menu.
 *
 * Strict: only in-stock options with a positive ShopDB price.
 * Preference among those: cheapest net price, then higher stock, then menu order.
 *
 * @param {Array<{ matchType?: string, status?: string, price?: number, sku?: string, stockCount?: number }>} alternatives
 * @returns {object|null}
 */
export function isAnalogAlternative(alt = {}) {
  if (!alt || typeof alt !== "object") return false;
  if (alt.matchType === "analog") return true;
  return /аналог|analog|zamiennik/i.test(String(alt.status || ""));
}

export function isInStockAlternative(alt = {}) {
  if (!alt || typeof alt !== "object") return false;
  if ((Number(alt.stockCount) || 0) > 0) return true;
  return /в\s*наличии|in\s*stock|na\s*stanie|dostęp/i.test(
    String(alt.status || "")
  );
}

export function isOutOfStockLine(line = {}) {
  if (!line || typeof line !== "object") return false;
  if ((Number(line.stockCount) || 0) > 0) return false;
  return /нет\s*в\s*наличии|out\s*of\s*stock|brak\s*w\s*magazynie|niedostęp/i.test(
    String(line.status || "")
  );
}

export function positiveAltPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

/** Net unit price on an alternatives-menu row (ShopDB). */
export function altNetPrice(alt = {}) {
  if (!alt || typeof alt !== "object") return 0;
  return (
    positiveAltPrice(alt.price) ||
    positiveAltPrice(alt.unitPriceNet) ||
    positiveAltPrice(alt.unitPrice) ||
    0
  );
}

/**
 * Cheapest in-stock + priced option from the alternatives menu.
 * Returns null when no stocked priced option exists (no OOS / zero-price fallback).
 */
export function pickCheapestAnalog(alternatives = []) {
  const list = (alternatives || []).filter(Boolean);
  if (!list.length) return null;

  const candidates = list.filter(
    (alt) => isInStockAlternative(alt) && altNetPrice(alt) > 0
  );
  if (!candidates.length) return null;

  // Stable sort: keep original menu order as tiebreaker.
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
 * For each draft line, resolve best in-stock+priced alternative from its menu.
 * Re-applies when SKU matches but the row still has no / wrong price.
 * @returns {{ index: number, alt: object, line: object }[]}
 */
export function resolveCheapestAnalogsForLines(lines = []) {
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
    // Skip only when already on this SKU/product AND price already matches.
    if ((sameSku || sameId) && !priceNeedsUpdate) return;
    picks.push({ index, alt, line });
  });
  return picks;
}

/**
 * Why «Дешёвые аналоги» has nothing to apply — toast must match reality.
 * @returns {'already_best'|'out_of_stock'|'no_menu'|'no_priced_stock'|'empty'}
 */
export function explainCheapestAnalogsEmpty(lines = []) {
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

export default pickCheapestAnalog;
