/**
 * Pick cheapest priced analog from a line's alternatives list.
 * Only matchType "analog" (or status «Аналог») with price > 0.
 * Exact / similar / size_mismatch are ignored — operator asked for analogs.
 *
 * @param {Array<{ matchType?: string, status?: string, price?: number, sku?: string, stockCount?: number }>} alternatives
 * @returns {object|null}
 */
export function isAnalogAlternative(alt = {}) {
  if (!alt || typeof alt !== "object") return false;
  if (alt.matchType === "analog") return true;
  return /аналог|analog|zamiennik/i.test(String(alt.status || ""));
}

export function positiveAltPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export function pickCheapestAnalog(alternatives = []) {
  const analogs = (alternatives || []).filter(
    (alt) => isAnalogAlternative(alt) && positiveAltPrice(alt.price) > 0
  );
  if (!analogs.length) return null;

  return [...analogs].sort((a, b) => {
    const priceDelta = positiveAltPrice(a.price) - positiveAltPrice(b.price);
    if (priceDelta) return priceDelta;
    const stockDelta = (Number(b.stockCount) || 0) - (Number(a.stockCount) || 0);
    if (stockDelta) return stockDelta;
    return String(a.sku || "").localeCompare(String(b.sku || ""));
  })[0];
}

/**
 * For each draft line, resolve cheapest analog from its alternatives.
 * @returns {{ index: number, alt: object, line: object }[]}
 */
export function resolveCheapestAnalogsForLines(lines = []) {
  const picks = [];
  (lines || []).forEach((line, index) => {
    const alt = pickCheapestAnalog(line?.alternatives);
    if (!alt) return;
    const currentSku = String(line.article || line.sku || "").trim();
    const nextSku = String(alt.sku || "").trim();
    // Skip if already on this SKU (idempotent re-click).
    if (currentSku && nextSku && currentSku === nextSku) return;
    picks.push({ index, alt, line });
  });
  return picks;
}

export default pickCheapestAnalog;
