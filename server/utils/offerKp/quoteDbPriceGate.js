"use strict";

const { parseAmount, multiplyLineTotal } = require("./quoteCalculator");
const {
  parseThresholdsFromEnv,
} = require("../../config/offerKp.harnessAntiHallucination");
const { parseCatalogEvidence } = require("./harnessEvidence");
const { parseMarkdownTable } = require("./quoteComplianceChecker");

const PENDING_PRICE_RE =
  /^(?:—|-|–|под\s*заказ|требует\s*проверки|нет\s*в\s*shopdb|n\/?a|tbd)?$/i;

function roundPrice(n) {
  return Math.round(Number(n) * 100) / 100;
}

function isPendingPriceCell(value = "") {
  const cell = String(value || "").trim();
  if (!cell) return true;
  if (PENDING_PRICE_RE.test(cell)) return true;
  if (/под\s*заказ|требует\s*проверки|нет\s*в\s*shopdb/i.test(cell)) {
    return true;
  }
  return false;
}

/**
 * @param {{ lines?: object[] }} draft
 * @returns {Set<number>}
 */
function collectAllowedPricesFromDraft(draft) {
  const allowed = new Set();
  for (const line of draft?.lines || []) {
    const net = Number(line.unitPriceNet);
    const gross = Number(line.priceWithVat);
    if (Number.isFinite(net) && net > 0) allowed.add(roundPrice(net));
    if (Number.isFinite(gross) && gross > 0) allowed.add(roundPrice(gross));
  }
  return allowed;
}

/**
 * @param {string[]} catalogBlocks
 * @returns {Set<number>}
 */
function collectAllowedPricesFromCatalog(catalogBlocks = []) {
  const allowed = new Set();
  for (const entry of parseCatalogEvidence(catalogBlocks)) {
    for (const p of entry.prices) {
      if (Number.isFinite(p) && p > 0) allowed.add(roundPrice(p));
    }
  }
  return allowed;
}

function findColumnIndexes(headerRow = []) {
  let priceIdx = -1;
  let qtyIdx = -1;
  let sumIdx = -1;
  for (let i = 0; i < headerRow.length; i++) {
    const cell = String(headerRow[i] || "").toLowerCase();
    if (priceIdx < 0 && /цен|price|cena|rub|руб/.test(cell)) priceIdx = i;
    if (qtyIdx < 0 && /кол-?во|колич|qty|ilość|quantity/.test(cell)) {
      qtyIdx = i;
    }
    if (sumIdx < 0 && /сумм|\bsum\b|razem|итого/.test(cell)) sumIdx = i;
  }
  return { priceIdx, qtyIdx, sumIdx };
}

function priceMatchesAllowed(price, allowed, tolerance) {
  if (!allowed.size) return false;
  return [...allowed].some((p) => Math.abs(p - price) <= tolerance);
}

function collectAllowedPrices(draft, catalogBlocks) {
  return new Set([
    ...collectAllowedPricesFromDraft(draft),
    ...collectAllowedPricesFromCatalog(catalogBlocks),
  ]);
}

/**
 * ChatGPT-style: never invent prices.
 * - Numeric price must match ShopDB/catalog
 * - Empty / «под заказ» always allowed
 * - If ShopDB has no prices yet, any invented number is rejected
 */
function validateQuotePricesFromDb(
  content = "",
  { draft = null, catalogBlocks = [], tolerance } = {}
) {
  const thresholds = parseThresholdsFromEnv();
  const tol = tolerance ?? thresholds.priceTolerance;
  const allowed = collectAllowedPrices(draft, catalogBlocks);

  const rows = parseMarkdownTable(content);
  if (rows.length < 2) {
    return { ok: true, violations: [], allowedCount: allowed.size };
  }

  const header = rows[0];
  const dataRows = rows.slice(1);
  const { priceIdx } = findColumnIndexes(header);
  const violations = [];

  if (priceIdx < 0) {
    return { ok: true, violations: [], allowedCount: allowed.size };
  }

  for (const row of dataRows) {
    const raw = row[priceIdx];
    if (isPendingPriceCell(raw)) continue;

    const price = parseAmount(raw);
    if (!Number.isFinite(price) || price <= 0) continue;

    if (!allowed.size || !priceMatchesAllowed(price, allowed, tol)) {
      violations.push({
        id: "price-not-in-shopdb",
        message: allowed.size
          ? `Цена ${price} не найдена в ShopDB (допустимые: ${[...allowed]
              .slice(0, 8)
              .join(", ")}${allowed.size > 8 ? "…" : ""})`
          : `Цена ${price} выдумана: в ShopDB нет подтверждённых цен — оставь пусто или «под заказ».`,
        hint: "Как ChatGPT: без цены ShopDB — колонка цены пустая / «под заказ», никогда не угадывай число.",
      });
      break;
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    allowedCount: allowed.size,
  };
}

/**
 * Rewrite invented numeric prices → «под заказ» (ChatGPT empty-price pattern).
 * Recalculate sum when price is kept from ShopDB.
 * @returns {{ content: string, changed: boolean, replaced: number }}
 */
function sanitizeQuotePricesToShopDb(
  content = "",
  { draft = null, catalogBlocks = [], tolerance } = {}
) {
  const thresholds = parseThresholdsFromEnv();
  const tol = tolerance ?? thresholds.priceTolerance;
  const allowed = collectAllowedPrices(draft, catalogBlocks);
  const lines = String(content || "").split("\n");
  let changed = false;
  let replaced = 0;
  let headerSeen = false;
  let priceIdx = -1;
  let qtyIdx = -1;
  let sumIdx = -1;

  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) return line;
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) return line;

    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);

    if (!cells.length) return line;

    if (!headerSeen) {
      headerSeen = true;
      ({ priceIdx, qtyIdx, sumIdx } = findColumnIndexes(cells));
      return line;
    }

    if (priceIdx < 0 || priceIdx >= cells.length) return line;

    const rawPrice = cells[priceIdx];
    if (isPendingPriceCell(rawPrice)) return line;

    const price = parseAmount(rawPrice);
    if (!Number.isFinite(price) || price <= 0) return line;

    if (allowed.size && priceMatchesAllowed(price, allowed, tol)) {
      if (qtyIdx >= 0 && sumIdx >= 0) {
        const qty = parseAmount(cells[qtyIdx]);
        const expected = multiplyLineTotal(qty, price);
        if (expected != null && String(cells[sumIdx] || "").trim() !== "") {
          const actual = parseAmount(cells[sumIdx]);
          if (!Number.isFinite(actual) || Math.abs(actual - expected) > 0.02) {
            cells[sumIdx] = expected.toFixed(2);
            changed = true;
          }
        }
      }
      return `| ${cells.join(" | ")} |`;
    }

    // Invented / no ShopDB match → ChatGPT style: leave pending
    cells[priceIdx] = "под заказ";
    if (sumIdx >= 0 && sumIdx < cells.length) cells[sumIdx] = "—";
    replaced += 1;
    changed = true;
    return `| ${cells.join(" | ")} |`;
  });

  return { content: out.join("\n"), changed, replaced };
}

module.exports = {
  collectAllowedPricesFromDraft,
  collectAllowedPricesFromCatalog,
  validateQuotePricesFromDb,
  sanitizeQuotePricesToShopDb,
  isPendingPriceCell,
};
