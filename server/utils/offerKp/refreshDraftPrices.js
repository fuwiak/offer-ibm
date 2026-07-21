"use strict";

/**
 * Temporal price grounding: re-read ShopDB prices for draft lines that already
 * have a productId, right before DOCX/PDF export. Prevents shipping a stale
 * snapshot from earlier in the same session.
 */

const VAT_RATE = 0.2;

/**
 * @param {object} draft - inquiryDbDraft shape { lines: [...] }
 * @param {(ids: Array<string|number>) => Promise<Map<string, object>>} fetchStocks
 * @returns {Promise<{ draft: object, refreshed: number, changed: number }>}
 */
async function refreshDraftPricesFromShopDb(draft, fetchStocks) {
  if (!draft?.lines?.length || typeof fetchStocks !== "function") {
    return { draft, refreshed: 0, changed: 0 };
  }

  const ids = draft.lines
    .map((l) => l.productId)
    .filter((id) => id != null && String(id).trim() !== "");
  if (!ids.length) return { draft, refreshed: 0, changed: 0 };

  const stocks = await fetchStocks(ids);
  let refreshed = 0;
  let changed = 0;
  const retrievedAt = new Date().toISOString();

  const lines = draft.lines.map((line) => {
    const pid = line.productId != null ? String(line.productId) : "";
    if (!pid) return line;
    const stock = stocks.get(pid);
    if (!stock) return { ...line, priceRetrievedAt: retrievedAt };

    refreshed += 1;
    const matchType = line.matchType;
    const accepted = matchType === "exact" || matchType === "analog";
    if (!accepted) {
      return { ...line, priceRetrievedAt: retrievedAt };
    }

    const livePrice = Number(stock.price) || 0;
    const prev = Number(line.unitPriceNet) || 0;
    if (Math.abs(livePrice - prev) > 0.009) changed += 1;

    const qty = Number(line.quantity) || 0;
    const unitNeedsRecalc = !!line.unitNeedsRecalc;
    const unitPriceNet = livePrice;
    const priceWithVat = unitPriceNet
      ? Number((unitPriceNet * (1 + VAT_RATE)).toFixed(2))
      : 0;
    const lineTotal =
      unitPriceNet > 0 && !unitNeedsRecalc
        ? Number((unitPriceNet * qty).toFixed(2))
        : 0;

    return {
      ...line,
      unitPriceNet,
      priceWithVat,
      lineTotal,
      article: stock.sku || line.article || "",
      priceRetrievedAt: retrievedAt,
      priceSnapshot: unitPriceNet,
    };
  });

  return {
    draft: { ...draft, lines, pricesRefreshedAt: retrievedAt },
    refreshed,
    changed,
  };
}

module.exports = { refreshDraftPricesFromShopDb, VAT_RATE };
