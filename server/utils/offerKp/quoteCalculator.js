"use strict";

function parseAmount(value) {
  if (value === null || value === undefined) return NaN;
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return NaN;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
}

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

/**
 * @param {number|string} quantity
 * @param {number|string} unitPrice
 */
function multiplyLineTotal(quantity, unitPrice) {
  const q = parseAmount(quantity);
  const p = parseAmount(unitPrice);
  if (!Number.isFinite(q) || !Number.isFinite(p)) return null;
  return roundMoney(q * p);
}

/**
 * Safe evaluation for simple quote math: digits, + - * / ( ) and spaces.
 * @param {string} expression
 */
function evaluateSafeExpression(expression = "") {
  const raw = String(expression || "").trim();
  if (!raw) return null;

  const cleaned = raw.replace(/^=/, "").replace(/,/g, ".").replace(/×/g, "*");
  if (!/^[\d\s.+*/()-]+$/.test(cleaned)) return null;

  const parts = cleaned.split("*").map((part) => part.trim());
  if (
    parts.length === 2 &&
    parts.every((part) => /^\d+(?:\.\d+)?$/.test(part))
  ) {
    return multiplyLineTotal(parts[0], parts[1]);
  }

  try {
    const value = Function(`"use strict"; return (${cleaned});`)();
    if (!Number.isFinite(value)) return null;
    return roundMoney(value);
  } catch {
    return null;
  }
}

/**
 * @param {Array<{ quantity?: number|string, unitPrice?: number|string, label?: string }>} lines
 */
function computeQuoteLines(lines = []) {
  const items = Array.isArray(lines) ? lines : [];
  const computed = [];
  let subtotal = 0;

  for (const [index, line] of items.entries()) {
    const quantity = line?.quantity ?? line?.qty ?? line?.count;
    const unitPrice = line?.unitPrice ?? line?.price ?? line?.unit_price;
    const lineTotal = multiplyLineTotal(quantity, unitPrice);
    if (lineTotal === null) {
      return {
        ok: false,
        error: `Invalid quantity or unitPrice at line ${index + 1}`,
        lines: computed,
      };
    }
    subtotal += lineTotal;
    computed.push({
      label: line?.label || line?.name || null,
      quantity: parseAmount(quantity),
      unitPrice: roundMoney(parseAmount(unitPrice)),
      lineTotal,
    });
  }

  return {
    ok: true,
    lines: computed,
    subtotal: roundMoney(subtotal),
  };
}

module.exports = {
  parseAmount,
  roundMoney,
  multiplyLineTotal,
  evaluateSafeExpression,
  computeQuoteLines,
};
