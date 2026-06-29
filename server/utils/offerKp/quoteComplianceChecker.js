"use strict";

const { multiplyLineTotal, parseAmount } = require("./quoteCalculator");
const {
  getMandatoryQuoteRequirements,
} = require("../../config/offerKp.quoteRequirements");

const QUOTE_DOC_SKILLS = new Set(["create-docx-file", "create-pdf-file"]);

function isQuoteDocSkill(skillName = "") {
  return QUOTE_DOC_SKILLS.has(String(skillName || "").trim());
}

function parseMarkdownTable(content = "") {
  const lines = String(content || "").split("\n");
  const rows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;

    const cells = trimmed
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell, index, arr) => index > 0 && index < arr.length - 1);

    if (cells.length) rows.push(cells);
  }

  return rows;
}

function headerIndex(headerRow = [], patterns = []) {
  for (let i = 0; i < headerRow.length; i++) {
    const cell = String(headerRow[i] || "").toLowerCase();
    if (patterns.some((re) => re.test(cell))) return i;
  }
  return -1;
}

function cellLooksLikeFormula(value = "") {
  const cell = String(value || "").trim();
  if (!cell) return false;
  return (
    /^=\s*\d/.test(cell) ||
    /^=\s*\d+[\d.,]*\s*[*×x]\s*\d+/i.test(cell) ||
    /^\d+[\d.,]*\s*[*×x]\s*\d+[\d.,]*$/.test(cell)
  );
}

function cellHasPricePlaceholder(value = "") {
  return /\[цена\]|\[price\]|\[cena\]|\bуточните\b|do uzupełnienia|\bTBD\b/i.test(
    String(value || "")
  );
}

function findNumericColumns(headerRow = []) {
  const qtyIdx = headerIndex(headerRow, [
    /кол-?во/,
    /колич/,
    /qty/,
    /ilość/,
    /quantity/,
  ]);
  const priceIdx = headerIndex(headerRow, [/цен/, /price/, /cena/, /rub/]);
  const sumIdx = headerIndex(headerRow, [/сумм/, /\bsum\b/, /razem/, /итого/]);
  return { qtyIdx, priceIdx, sumIdx };
}

/**
 * @param {{ content?: string, skillName?: string }} opts
 * @returns {{ ok: boolean, violations: Array<{ id: string, message: string, hint?: string }> }}
 */
function checkQuoteCompliance({ content = "" } = {}) {
  const violations = [];
  const text = String(content || "").trim();
  const requirements = getMandatoryQuoteRequirements();
  const reqById = Object.fromEntries(requirements.map((r) => [r.id, r]));

  if (!text) {
    violations.push({
      id: "non-empty-table",
      message: reqById["non-empty-table"]?.description || "Empty content",
      hint: reqById["non-empty-table"]?.hint,
    });
    return { ok: false, violations };
  }

  if (
    /шаблон|template|заполн|do uzupełnienia|placeholder/i.test(text) &&
    !/\|\s*[^|]+\|\s*[^|]+\|\s*[\d.,]+/.test(text)
  ) {
    violations.push({
      id: "no-empty-template",
      message: reqById["no-empty-template"].description,
      hint: reqById["no-empty-template"].hint,
    });
  }

  if (/=\s*\d+[\d.,]*\s*[*×x]\s*\d+/i.test(text)) {
    violations.push({
      id: "no-formula-sums",
      message: reqById["no-formula-sums"].description,
      hint: reqById["no-formula-sums"].hint,
    });
  }

  const rows = parseMarkdownTable(text);
  const dataRows = rows.length > 1 ? rows.slice(1) : rows;

  if (!dataRows.length) {
    violations.push({
      id: "non-empty-table",
      message: reqById["non-empty-table"].description,
      hint: reqById["non-empty-table"].hint,
    });
    return { ok: false, violations };
  }

  const header = rows[0] || dataRows[0];
  const { qtyIdx, priceIdx, sumIdx } = findNumericColumns(header);

  if (priceIdx < 0 || sumIdx < 0) {
    violations.push({
      id: "price-and-sum-columns",
      message: reqById["price-and-sum-columns"].description,
      hint: reqById["price-and-sum-columns"].hint,
    });
  }

  for (const row of dataRows) {
    for (const cell of row) {
      if (cellHasPricePlaceholder(cell)) {
        pushOnce(violations, {
          id: "numeric-prices",
          message: reqById["numeric-prices"].description,
          hint: reqById["numeric-prices"].hint,
        });
      }
      if (cellLooksLikeFormula(cell)) {
        pushOnce(violations, {
          id: "no-formula-sums",
          message: reqById["no-formula-sums"].description,
          hint: reqById["no-formula-sums"].hint,
        });
      }
    }

    if (qtyIdx < 0 || priceIdx < 0 || sumIdx < 0) continue;

    const qty = parseAmount(row[qtyIdx]);
    const price = parseAmount(row[priceIdx]);
    const sumCell = String(row[sumIdx] || "").trim();
    const expected = multiplyLineTotal(qty, price);

    if (!Number.isFinite(price) || price <= 0) {
      pushOnce(violations, {
        id: "numeric-prices",
        message: reqById["numeric-prices"].description,
        hint: reqById["numeric-prices"].hint,
      });
      continue;
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      pushOnce(violations, {
        id: "invalid-quantity",
        message: reqById["invalid-quantity"].description,
        hint: reqById["invalid-quantity"].hint,
      });
      continue;
    }

    if (cellLooksLikeFormula(sumCell)) continue;

    const actual = parseAmount(sumCell);
    if (!Number.isFinite(actual)) {
      pushOnce(violations, {
        id: "correct-line-totals",
        message: reqById["correct-line-totals"].description,
        hint: reqById["correct-line-totals"].hint,
      });
      continue;
    }

    if (expected !== null && Math.abs(actual - expected) > 0.02) {
      pushOnce(violations, {
        id: "correct-line-totals",
        message: `${reqById["correct-line-totals"].description} (ожидалось ${expected}, в таблице ${actual})`,
        hint: reqById["correct-line-totals"].hint,
      });
    }
  }

  const unique = dedupeViolations(violations);
  return { ok: unique.length === 0, violations: unique };
}

function pushOnce(list, item) {
  if (!list.some((v) => v.id === item.id)) list.push(item);
}

function dedupeViolations(violations = []) {
  const seen = new Set();
  return violations.filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });
}

function formatComplianceRejection(violations = []) {
  const lines = violations.map(
    (v) => `- ${v.message}${v.hint ? ` → ${v.hint}` : ""}`
  );
  return lines.join("\n");
}

module.exports = {
  QUOTE_DOC_SKILLS,
  isQuoteDocSkill,
  parseMarkdownTable,
  checkQuoteCompliance,
  formatComplianceRejection,
};
