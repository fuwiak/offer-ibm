"use strict";

/**
 * Pre-export / pre-render guards for КП.
 * Fail closed: if a guard fails, documents must not be exported.
 */

const { PRICE_ELIGIBLE_MATCH_TYPES } = require("./matchEvidence");

/**
 * @typedef {{ id: string, message: string, severity?: "error"|"warn" }} GuardViolation
 */

/**
 * @param {{
 *   sourceLines?: object[],
 *   quoteLines?: object[],
 *   draft?: { lines?: object[], priceSnapshotId?: string|null },
 *   requireSnapshot?: boolean,
 * }} input
 * @returns {{ ok: boolean, violations: GuardViolation[] }}
 */
function assertExportGuards(input = {}) {
  const violations = [];
  const sourceLines = input.sourceLines || [];
  const quoteLines =
    input.quoteLines || input.draft?.lines || [];

  if (sourceLines.length > 0 && sourceLines.length !== quoteLines.length) {
    violations.push({
      id: "source_line_count",
      message: `sourceLines.length (${sourceLines.length}) !== quoteLines.length (${quoteLines.length})`,
      severity: "error",
    });
  }

  for (let i = 0; i < quoteLines.length; i++) {
    const line = quoteLines[i] || {};
    const matchType = String(line.matchType || "none");
    const unitPrice = Number(line.unitPriceNet ?? line.unitPrice ?? 0) || 0;
    const productId = line.productId ? String(line.productId) : "";

    if (unitPrice > 0 && !PRICE_ELIGIBLE_MATCH_TYPES.includes(matchType)) {
      violations.push({
        id: "price_without_eligible_match",
        message: `line[${i}] price=${unitPrice} but matchType=${matchType}`,
        severity: "error",
      });
    }

    if (
      unitPrice > 0 &&
      line.allowPrice === false
    ) {
      violations.push({
        id: "price_when_allowPrice_false",
        message: `line[${i}] has price but allowPrice=false`,
        severity: "error",
      });
    }

    // Invented / placeholder SKU: never export filler like 1000…000.
    const article = String(line.article || line.sku || "").trim();
    if (article) {
      try {
        const { isFabricatedSku } = require("./fabricatedSku");
        if (isFabricatedSku(article)) {
          violations.push({
            id: "fabricated_sku",
            message: `line[${i}] fabricated SKU=${article}`,
            severity: "error",
          });
        }
      } catch {
        /* ignore */
      }
    }

    // Invented SKU: price present without product id / article from ShopDB.
    if (unitPrice > 0 && !productId && !article) {
      violations.push({
        id: "invented_sku",
        message: `line[${i}] priced without productId/sku`,
        severity: "error",
      });
    }

    // selected product must match priced product when both set
    const evidenceId = line.evidence?.selected_product_id;
    if (
      evidenceId &&
      productId &&
      String(evidenceId) !== String(productId)
    ) {
      violations.push({
        id: "evidence_product_mismatch",
        message: `line[${i}] productId=${productId} vs evidence=${evidenceId}`,
        severity: "error",
      });
    }
  }

  if (input.requireSnapshot) {
    const snap =
      input.draft?.priceSnapshotId ||
      input.priceSnapshotId ||
      null;
    if (!snap) {
      violations.push({
        id: "missing_shopdb_snapshot",
        message: "shopDbSnapshotId / priceSnapshotId required for export",
        severity: "error",
      });
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

/**
 * Strip illegal prices in-place (copy) when soft-fixing instead of hard fail.
 * @param {object[]} lines
 */
function stripIllegalPrices(lines = []) {
  const { stripFabricatedSkusFromLines } = require("./fabricatedSku");
  return stripFabricatedSkusFromLines(
    (lines || []).map((line) => {
      const matchType = String(line.matchType || "none");
      const eligible = PRICE_ELIGIBLE_MATCH_TYPES.includes(matchType);
      if (eligible && line.allowPrice !== false) return line;
      return {
        ...line,
        unitPriceNet: 0,
        unitPrice: 0,
        priceWithVat: 0,
        lineTotal: 0,
        allowPrice: false,
        priceSnapshot: null,
      };
    })
  );
}

module.exports = {
  assertExportGuards,
  stripIllegalPrices,
};
