"use strict";

/**
 * Constraint satisfaction for fastener matching.
 * Hard violations → reject auto-exact; soft → score penalty.
 */

const {
  normalizeForMatch,
  parseHardwareQuery,
  PRODUCT_TYPE_ROOTS,
} = require("../hardwareQuery");
const {
  extractThread,
  extractPinDimensions,
  extractStandardNumbers,
  threadMatchesExact,
  pinMatchesExact,
  getEquivalentStandards,
} = require("../analogRules");
const { areStandardsCompatible, getStandardMeta } = require("./standardGraph");

const HARD = Object.freeze({
  PRODUCT_TYPE: "product_type_mismatch",
  DIAMETER: "diameter_mismatch",
  LENGTH: "length_mismatch",
  STANDARD: "standard_mismatch",
  PIN_SIZE: "pin_size_mismatch",
});

const SOFT = Object.freeze({
  COATING: "coating_mismatch",
  STRENGTH: "strength_class_mismatch",
  MISSING_QUERY_SIZE: "missing_query_size",
});

function productTypeHits(nameNorm, types = []) {
  if (!types.length) return true;
  return types.some((type) =>
    (PRODUCT_TYPE_ROOTS[type] || [type]).some((root) =>
      nameNorm.includes(normalizeForMatch(root))
    )
  );
}

function extractProductDiameter(nameNorm) {
  const m = nameNorm.match(/\bm\s*(\d+)\s*x\s*(\d+)\b/i);
  if (m) return { size: m[1], length: m[2] };
  return null;
}

/**
 * @param {string} queryText
 * @param {{name?: string, matchType?: string}} product
 * @returns {{
 *   hard: string[],
 *   soft: string[],
 *   ok: boolean,
 *   scorePenalty: number,
 * }}
 */
function validateCandidate(queryText, product = {}) {
  const hard = [];
  const soft = [];
  const nameNorm = normalizeForMatch(product.name || "");
  const parsed = parseHardwareQuery(queryText);
  const thread = extractThread(queryText) || parsed.thread;
  const pin = extractPinDimensions(queryText);
  const requestedStandards = extractStandardNumbers(queryText);

  if ((parsed.productTypes || []).length && !productTypeHits(nameNorm, parsed.productTypes)) {
    hard.push(HARD.PRODUCT_TYPE);
  }

  if (thread) {
    if (!threadMatchesExact(nameNorm, thread)) {
      const productThread = extractProductDiameter(nameNorm);
      if (productThread) {
        if (productThread.size !== thread.size) hard.push(HARD.DIAMETER);
        if (productThread.length !== thread.length) hard.push(HARD.LENGTH);
        if (!hard.includes(HARD.DIAMETER) && !hard.includes(HARD.LENGTH)) {
          hard.push(HARD.DIAMETER);
        }
      } else if (nameNorm.includes(`m ${thread.size}`) || nameNorm.includes(`m${thread.size}`)) {
        hard.push(HARD.LENGTH);
      }
    }
  } else {
    // Diameter-only query (nuts etc.): "M10" without length.
    const qDiam = String(queryText || "").match(/\bm\s*(\d+)\b/i);
    const pDiam = nameNorm.match(/\bm\s*(\d+)\b/i);
    if (qDiam && pDiam && qDiam[1] !== pDiam[1]) {
      hard.push(HARD.DIAMETER);
    }
  }

  if (!thread && pin) {
    if (!pinMatchesExact(nameNorm, pin)) {
      hard.push(HARD.PIN_SIZE);
    }
  } else if (
    !thread &&
    !pin &&
    /\b(болт|винт|гайк|штифт|bolt|screw|nut|pin)\b/i.test(queryText) &&
    extractProductDiameter(nameNorm)
  ) {
    const qDiam = String(queryText || "").match(/\bm\s*(\d+)\b/i);
    if (!qDiam) soft.push(SOFT.MISSING_QUERY_SIZE);
  }

  if (requestedStandards.length) {
    const productStandards = extractStandardNumbers(product.name || "");
    if (productStandards.length) {
      const compatible = requestedStandards.some((req) => {
        const equiv = getEquivalentStandards(req);
        return productStandards.some(
          (ps) =>
            equiv.includes(String(ps)) ||
            areStandardsCompatible(req, ps) ||
            String(ps) === String(req)
        );
      });
      if (!compatible) {
        // Only hard-fail when both sides name a standard and they conflict.
        const metaConflict = requestedStandards.some((req) => {
          const meta = getStandardMeta(req);
          return (
            meta &&
            productStandards.some((ps) => {
              const pMeta = getStandardMeta(ps);
              return (
                pMeta &&
                meta.productType === pMeta.productType &&
                !areStandardsCompatible(req, ps) &&
                String(req) !== String(ps)
              );
            })
          );
        });
        if (metaConflict || !requestedStandards.some((r) =>
          productStandards.some((ps) => String(r) === String(ps))
        )) {
          // Soft if product has unrelated numbering noise; hard if clearly different family.
          if (metaConflict) hard.push(HARD.STANDARD);
          else soft.push(HARD.STANDARD);
        }
      }
    }
  }

  if (parsed.coating && !/оцинк|цинк|ocink|cink|\bzn\b|zinc/i.test(nameNorm)) {
    soft.push(SOFT.COATING);
  }
  if (
    parsed.strengthClass &&
    !new RegExp(`\\b${parsed.strengthClass.replace(".", "\\.")}\\b`).test(nameNorm)
  ) {
    soft.push(SOFT.STRENGTH);
  }

  const scorePenalty =
    hard.length * 1000 +
    soft.filter((s) => s === SOFT.COATING || s === SOFT.STRENGTH).length * 25 +
    soft.filter((s) => s === SOFT.MISSING_QUERY_SIZE).length * 40 +
    soft.filter((s) => s === HARD.STANDARD).length * 60;

  return {
    hard,
    soft,
    ok: hard.length === 0,
    scorePenalty,
  };
}

/**
 * Drop or demote candidates that violate hard constraints.
 * exact/analog with hard violations → size_mismatch / spec_mismatch.
 */
function applyConstraintsToAlternative(queryText, alt) {
  const result = validateCandidate(queryText, alt);
  const next = {
    ...alt,
    constraintViolations: result.hard,
    softConstraintViolations: result.soft,
    constraintPenalty: result.scorePenalty,
  };

  if (!result.hard.length) return next;

  const demoteTo =
    result.hard.includes(HARD.DIAMETER) ||
    result.hard.includes(HARD.LENGTH) ||
    result.hard.includes(HARD.PIN_SIZE)
      ? "size_mismatch"
      : result.hard.includes(HARD.PRODUCT_TYPE)
        ? "spec_mismatch"
        : "none";

  if (alt.matchType === "exact" || alt.matchType === "analog") {
    next.matchType = demoteTo;
    next.mismatchReason = result.hard[0];
    next.status = demoteTo === "size_mismatch" ? "Под заказ" : "Требует проверки";
  }
  return next;
}

module.exports = {
  HARD,
  SOFT,
  validateCandidate,
  applyConstraintsToAlternative,
};
