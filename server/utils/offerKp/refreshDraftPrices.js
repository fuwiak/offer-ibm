"use strict";

/**
 * Temporal price grounding: re-read ShopDB prices for draft lines that already
 * have a productId, right before DOCX/PDF export. Prevents shipping a stale
 * snapshot from earlier in the same session.
 *
 * Price is always taken from the SKU row that matches line.article (or the
 * product's bestSku) — never from a sibling variant on the same product.
 */

const { resolveSkuRowPrice } = require("./priceResolve");

const VAT_RATE = 0.2;

function findSkuRowForLine(stock, line = {}) {
  const skus = Array.isArray(stock?.skus) ? stock.skus : [];
  const wanted = String(line.article || line.sku || "").trim();
  if (wanted && skus.length) {
    const hit = skus.find(
      (row) => String(row.sku || "").trim() === wanted
    );
    if (hit) return hit;
  }
  return null;
}

/**
 * Live unit price for a draft line from a fetchProductStocks() entry.
 * Prefers the SKU already selected on the line; falls back to stock.price
 * (which must itself be bound to bestSku — see fetchProductStocks).
 */
function livePriceForLine(stock, line = {}) {
  if (!stock) return { price: 0, sku: "", skuId: null, source: null };
  const matched = findSkuRowForLine(stock, line);
  if (matched) {
    const resolved = resolveSkuRowPrice(matched);
    return {
      price: resolved.price,
      sku: matched.sku || stock.sku || "",
      skuId: matched.sku_id != null ? Number(matched.sku_id) : stock.skuId,
      source: resolved.source,
    };
  }
  return {
    price: Number(stock.price) || 0,
    sku: stock.sku || "",
    skuId: stock.skuId != null ? Number(stock.skuId) : null,
    source: stock.priceSource || null,
  };
}

function recalcDraftTotals(draft, vatRate = VAT_RATE) {
  const lines = Array.isArray(draft?.lines) ? draft.lines : [];
  const subtotal = Number(
    lines
      .reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0)
      .toFixed(2)
  );
  return {
    ...draft,
    lines,
    subtotal,
    total: subtotal,
    vatRate,
  };
}

/**
 * @param {object} draft - inquiryDbDraft shape { lines: [...] }
 * @param {(ids: Array<string|number>) => Promise<Map<string, object>>} fetchStocks
 * @param {{
 *   failMissing?: boolean,
 *   vatRate?: number,
 * }} [opts]
 *   failMissing=true → zero prices when ShopDB has no row (export fail-closed)
 * @returns {Promise<{ draft: object, refreshed: number, changed: number, missing: number }>}
 */
async function refreshDraftPricesFromShopDb(draft, fetchStocks, opts = {}) {
  if (!draft?.lines?.length || typeof fetchStocks !== "function") {
    return { draft, refreshed: 0, changed: 0, missing: 0 };
  }

  const vatRate =
    Number.isFinite(Number(opts.vatRate)) && Number(opts.vatRate) >= 0
      ? Number(opts.vatRate)
      : VAT_RATE;
  const failMissing = opts.failMissing === true;

  const ids = draft.lines
    .map((l) => l.productId)
    .filter((id) => id != null && String(id).trim() !== "");
  if (!ids.length) {
    return {
      draft: recalcDraftTotals(draft, vatRate),
      refreshed: 0,
      changed: 0,
      missing: 0,
    };
  }

  const stocks = await fetchStocks(ids);
  let refreshed = 0;
  let changed = 0;
  let missing = 0;
  const retrievedAt = new Date().toISOString();

  const lines = draft.lines.map((line) => {
    const pid = line.productId != null ? String(line.productId) : "";
    if (!pid) return line;

    // Explicit operator override: keep price, stamp retrieval time.
    if (line.operatorPriceOverride) {
      refreshed += 1;
      return { ...line, priceRetrievedAt: retrievedAt };
    }

    const stock = stocks.get(pid);
    if (!stock) {
      missing += 1;
      if (!failMissing) {
        return { ...line, priceRetrievedAt: retrievedAt };
      }
      // Fail-closed: do not keep a stale catalog price when ShopDB has no row.
      const matchType = line.matchType;
      const accepted = matchType === "exact" || matchType === "analog";
      if (!accepted) return { ...line, priceRetrievedAt: retrievedAt };
      changed += Number(line.unitPriceNet) > 0 ? 1 : 0;
      return {
        ...line,
        unitPriceNet: 0,
        priceWithVat: 0,
        lineTotal: 0,
        allowPrice: false,
        priceSnapshot: null,
        priceRetrievedAt: retrievedAt,
        priceSource: null,
      };
    }

    refreshed += 1;
    const matchType = line.matchType;
    const accepted = matchType === "exact" || matchType === "analog";
    if (!accepted) {
      return { ...line, priceRetrievedAt: retrievedAt };
    }

    const live = livePriceForLine(stock, line);
    const livePrice = live.price;
    const prev = Number(line.unitPriceNet) || 0;
    if (Math.abs(livePrice - prev) > 0.009) changed += 1;

    const qty = Number(line.quantity) || 0;
    const unitNeedsRecalc = !!line.unitNeedsRecalc;
    const unitPriceNet = livePrice;
    const priceWithVat = unitPriceNet
      ? Number((unitPriceNet * (1 + vatRate)).toFixed(2))
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
      article: live.sku || line.article || "",
      sku: live.sku || line.sku || line.article || "",
      skuId: live.skuId != null ? live.skuId : line.skuId,
      allowPrice: unitPriceNet > 0,
      priceRetrievedAt: retrievedAt,
      priceSnapshot: unitPriceNet,
      priceSource: live.source,
    };
  });

  return {
    draft: recalcDraftTotals(
      { ...draft, lines, pricesRefreshedAt: retrievedAt },
      vatRate
    ),
    refreshed,
    changed,
    missing,
  };
}

module.exports = {
  refreshDraftPricesFromShopDb,
  livePriceForLine,
  findSkuRowForLine,
  recalcDraftTotals,
  VAT_RATE,
};
