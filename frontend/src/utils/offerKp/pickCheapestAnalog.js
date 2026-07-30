/**
 * Pick an alternative from the same list as the draft-table «Аналоги» menu.
 *
 * Preference: in-stock first, then cheapest price among those.
 * Exact / similar / analog all count — operators see them in the dropdown;
 * we no longer require matchType === "analog" (that left most rows empty).
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

export function positiveAltPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

/**
 * First usable in-stock option from the alternatives menu (cheapest among
 * those in stock). Falls back to cheapest priced option if stock is unknown.
 */
export function pickCheapestAnalog(alternatives = []) {
  const list = (alternatives || []).filter(Boolean);
  if (!list.length) return null;

  const inStock = list.filter(isInStockAlternative);
  const pool = inStock.length ? inStock : list;

  const priced = pool.filter((alt) => positiveAltPrice(alt.price) > 0);
  const candidates = priced.length ? priced : pool;
  if (!candidates.length) return null;

  // Stable sort: keep original menu order as tiebreaker.
  return [...candidates]
    .map((alt, menuIndex) => ({ alt, menuIndex }))
    .sort((a, b) => {
      const priceDelta =
        positiveAltPrice(a.alt.price) - positiveAltPrice(b.alt.price);
      if (priceDelta) return priceDelta;
      const stockDelta =
        (Number(b.alt.stockCount) || 0) - (Number(a.alt.stockCount) || 0);
      if (stockDelta) return stockDelta;
      return a.menuIndex - b.menuIndex;
    })[0].alt;
}

/**
 * For each draft line, resolve best in-stock alternative from its menu.
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
    // Skip if already on this SKU / product (idempotent re-click).
    if (currentSku && nextSku && currentSku === nextSku) return;
    if (currentId && nextId && currentId === nextId) return;
    picks.push({ index, alt, line });
  });
  return picks;
}

export default pickCheapestAnalog;
