"use strict";

/**
 * Temporal price grounding: re-read ShopDB prices for draft lines that already
 * have a productId, right before DOCX/PDF export. Prevents shipping a stale
 * snapshot from earlier in the same session.
 *
 * Price is always taken from the SKU row that matches line.article.
 * Never silently fall back to the product's cheapest/bestSku sibling.
 */

const { resolvePreferredSkuPrice } = require("./priceResolve");

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
 * Requires the SKU already selected on the line (article/sku).
 * If that SKU is missing or has no price → price 0 (no bestSku fallback).
 */
function livePriceForLine(stock, line = {}) {
  if (!stock) {
    return {
      price: 0,
      sku: "",
      skuId: null,
      source: null,
      skuMissing: false,
    };
  }

  const wanted = String(line.article || line.sku || "").trim();
  if (!wanted) {
    // Exact/analog export must pin a SKU. Do not invent bestSku price.
    return {
      price: 0,
      sku: "",
      skuId: null,
      source: null,
      skuMissing: false,
      skuUnspecified: true,
    };
  }

  const pinned = resolvePreferredSkuPrice(stock.skus || [], wanted);
  if (pinned.skuMissing) {
    return {
      price: 0,
      sku: wanted,
      skuId: null,
      source: null,
      skuMissing: true,
    };
  }

  return {
    price: pinned.price,
    sku: pinned.sku || wanted,
    skuId:
      pinned.skuRow?.sku_id != null ? Number(pinned.skuRow.sku_id) : null,
    source: pinned.source,
    skuMissing: false,
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
 * @returns {Promise<{
 *   draft: object,
 *   refreshed: number,
 *   changed: number,
 *   missing: number,
 *   skuMissing: number,
 * }>}
 */
async function refreshDraftPricesFromShopDb(draft, fetchStocks, opts = {}) {
  if (!draft?.lines?.length || typeof fetchStocks !== "function") {
    return { draft, refreshed: 0, changed: 0, missing: 0, skuMissing: 0 };
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
      skuMissing: 0,
    };
  }

  const stocks = await fetchStocks(ids);
  let refreshed = 0;
  let changed = 0;
  let missing = 0;
  let skuMissing = 0;
  const retrievedAt = new Date().toISOString();

  const lines = draft.lines.map((line) => {
    const pid = line.productId != null ? String(line.productId) : "";
    if (!pid) return line;

    // Explicit operator override: keep price, stamp retrieval time.
    if (line.operatorPriceOverride) {
      refreshed += 1;
      return { ...line, priceRetrievedAt: retrievedAt, skuMissing: false };
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
        skuMissing: false,
      };
    }

    refreshed += 1;
    const matchType = line.matchType;
    const accepted = matchType === "exact" || matchType === "analog";
    if (!accepted) {
      return { ...line, priceRetrievedAt: retrievedAt, skuMissing: false };
    }

    const live = livePriceForLine(stock, line);
    if (live.skuMissing || live.skuUnspecified) {
      skuMissing += 1;
    }

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

    const next = {
      ...line,
      unitPriceNet,
      priceWithVat,
      lineTotal,
      // Keep the intended article even when missing from ShopDB (fail-closed).
      article: live.sku || line.article || "",
      sku: live.sku || line.sku || line.article || "",
      skuId: live.skuId != null ? live.skuId : line.skuId,
      allowPrice: unitPriceNet > 0 && !live.skuMissing && !live.skuUnspecified,
      priceRetrievedAt: retrievedAt,
      priceSnapshot: unitPriceNet > 0 ? unitPriceNet : null,
      priceSource: live.source,
      skuMissing: !!live.skuMissing || !!live.skuUnspecified,
    };

    if (live.skuMissing || live.skuUnspecified) {
      next.status = "needs_review";
      next.kpStatus = "Требуется проверка";
      const note = live.skuMissing
        ? `SKU «${line.article || line.sku}» отсутствует в ShopDB — цена не назначена`
        : "SKU не указан для exact/analog — цена не назначена (без silent bestSku)";
      if (!String(next.comment || "").includes(note)) {
        next.comment = [next.comment, note].filter(Boolean).join("; ");
      }
    }

    return next;
  });

  return {
    draft: recalcDraftTotals(
      { ...draft, lines, pricesRefreshedAt: retrievedAt },
      vatRate
    ),
    refreshed,
    changed,
    missing,
    skuMissing,
  };
}

module.exports = {
  refreshDraftPricesFromShopDb,
  livePriceForLine,
  findSkuRowForLine,
  recalcDraftTotals,
  VAT_RATE,
};
