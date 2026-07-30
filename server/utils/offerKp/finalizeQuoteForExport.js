"use strict";

/**
 * Single server-side gate for PDF / DOCX / XLSX / worker / auto-artifacts.
 *
 * Trust from the browser:
 *   - productId / article (SKU selection)
 *   - quantity
 *   - explicit operatorPriceOverride (+ its unitPriceNet)
 *   - customer / reference / doc meta
 *
 * Never trust from the browser:
 *   - unitPriceNet / priceWithVat / lineTotal / subtotal (unless operator override)
 *
 * Flow: refresh from ShopDB → strip illegal prices → recalc totals →
 * assertExportGuards → stamp priceSnapshotId.
 */

const { v4: uuidv4 } = require("uuid");
const {
  assertExportGuards,
  stripIllegalPrices,
} = require("./exportGuards");
const {
  refreshDraftPricesFromShopDb,
  recalcDraftTotals,
  VAT_RATE,
} = require("./refreshDraftPrices");

function normalizeExportLines(quoteData = {}) {
  if (Array.isArray(quoteData.lines) && quoteData.lines.length) {
    return quoteData.lines;
  }
  if (Array.isArray(quoteData.hardwareLines) && quoteData.hardwareLines.length) {
    return quoteData.hardwareLines;
  }
  if (
    Array.isArray(quoteData.preview?.lines) &&
    quoteData.preview.lines.length
  ) {
    return quoteData.preview.lines;
  }
  return [];
}

function mapLineForGenerator(line = {}, vatRate = VAT_RATE) {
  const qty = Math.max(0, Number(line.quantity) || 0);
  const unitPriceNet = Number(line.unitPriceNet) || 0;
  const priceWithVat =
    Number(line.priceWithVat) ||
    (unitPriceNet > 0 ? Number((unitPriceNet * (1 + vatRate)).toFixed(2)) : 0);
  const lineTotal =
    Number(line.lineTotal) ||
    (unitPriceNet > 0 ? Number((unitPriceNet * qty).toFixed(2)) : 0);
  return {
    ...line,
    productName: line.productName || line.name,
    productNameRu: line.productNameRu || line.name,
    sku: line.sku || line.article || "",
    article: line.article || line.sku || "",
    unitPrice: unitPriceNet,
    unitPriceNet,
    priceWithVat,
    lineTotal,
    quantity: qty,
  };
}

/**
 * @param {object} quoteData — body from UI or worker
 * @param {{
 *   fetchProductStocks?: Function,
 *   requireSnapshot?: boolean,
 *   sourceLines?: object[],
 *   failClosedOnShopDbError?: boolean,
 * }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   quoteData?: object,
 *   violations?: object[],
 *   error?: string,
 *   message?: string,
 *   refreshed?: number,
 *   changed?: number,
 *   missing?: number,
 * }>}
 */
async function finalizeQuoteForExport(quoteData = {}, options = {}) {
  const linesIn = normalizeExportLines(quoteData);
  if (!linesIn.length) {
    return {
      ok: false,
      error: "empty_quote",
      message: "Quote has no lines to export.",
      violations: [{ id: "empty_quote", message: "no lines", severity: "error" }],
    };
  }

  const vatRate =
    Number.isFinite(Number(quoteData.vatRate)) && Number(quoteData.vatRate) >= 0
      ? Number(quoteData.vatRate)
      : VAT_RATE;

  let fetchStocks = options.fetchProductStocks;
  if (typeof fetchStocks !== "function") {
    ({ fetchProductStocks: fetchStocks } = require("./matchInquiryLines"));
  }

  let draft = {
    reference: quoteData.reference || null,
    customer: quoteData.customer || {},
    lines: linesIn.map((l) => ({ ...l })),
    vatRate,
  };

  let refreshed = 0;
  let changed = 0;
  let missing = 0;

  try {
    const result = await refreshDraftPricesFromShopDb(draft, fetchStocks, {
      failMissing: true,
      vatRate,
    });
    draft = result.draft;
    refreshed = result.refreshed;
    changed = result.changed;
    missing = result.missing || 0;
  } catch (err) {
    if (options.failClosedOnShopDbError !== false) {
      return {
        ok: false,
        error: "shopdb_unavailable",
        message:
          err?.message ||
          "ShopDB price refresh failed — export blocked (fail-closed).",
        violations: [
          {
            id: "shopdb_unavailable",
            message: String(err?.message || err),
            severity: "error",
          },
        ],
      };
    }
    // Soft path: still strip + guard without live refresh.
    console.warn(
      "[finalizeQuoteForExport] ShopDB refresh failed, continuing soft:",
      err?.message || err
    );
  }

  draft = {
    ...draft,
    lines: stripIllegalPrices(draft.lines),
  };
  draft = recalcDraftTotals(draft, vatRate);

  const priceSnapshotId =
    quoteData.priceSnapshotId ||
    draft.priceSnapshotId ||
    `snap_${Date.now()}_${uuidv4().slice(0, 8)}`;
  draft.priceSnapshotId = priceSnapshotId;

  const guard = assertExportGuards({
    sourceLines: options.sourceLines || [],
    quoteLines: draft.lines,
    draft,
    requireSnapshot: options.requireSnapshot !== false,
  });

  if (!guard.ok) {
    return {
      ok: false,
      error: "export_guards_failed",
      message: guard.violations.map((v) => v.id).join(", "),
      violations: guard.violations,
      quoteData: null,
      refreshed,
      changed,
      missing,
    };
  }

  const outLines = draft.lines.map((l) => mapLineForGenerator(l, vatRate));
  const shipping = Number(quoteData.shipping) || 0;
  const subtotal = draft.subtotal;
  const total = Number((subtotal + shipping).toFixed(2));

  return {
    ok: true,
    refreshed,
    changed,
    missing,
    quoteData: {
      ...quoteData,
      lines: outLines,
      hardwareLines: outLines,
      preview: {
        ...(quoteData.preview || {}),
        lines: outLines,
        subtotal,
        total,
      },
      subtotal,
      total,
      shipping,
      vatRate,
      priceSnapshotId,
      pricesRefreshedAt: draft.pricesRefreshedAt || null,
    },
  };
}

module.exports = {
  finalizeQuoteForExport,
  normalizeExportLines,
  mapLineForGenerator,
};
