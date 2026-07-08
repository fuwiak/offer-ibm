"use strict";

const { parseAmount } = require("./quoteCalculator");
const { parseThresholdsFromEnv } = require("../../config/offerKp.harnessAntiHallucination");
const { parseCatalogEvidence } = require("./harnessEvidence");
const { parseMarkdownTable } = require("./quoteComplianceChecker");

function roundPrice(n) {
  return Math.round(Number(n) * 100) / 100;
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

function findPriceColumnIndex(headerRow = []) {
  for (let i = 0; i < headerRow.length; i++) {
    const cell = String(headerRow[i] || "").toLowerCase();
    if (/цен|price|cena|rub|руб/.test(cell)) return i;
  }
  return -1;
}

function priceMatchesAllowed(price, allowed, tolerance) {
  if (!allowed.size) return true;
  return [...allowed].some((p) => Math.abs(p - price) <= tolerance);
}

/**
 * Цены в КП должны совпадать с ShopDB (черновик matchInquiryToDraft и/или блоки каталога).
 */
function validateQuotePricesFromDb(
  content = "",
  { draft = null, catalogBlocks = [], tolerance } = {}
) {
  const thresholds = parseThresholdsFromEnv();
  const tol = tolerance ?? thresholds.priceTolerance;

  const allowed = new Set([
    ...collectAllowedPricesFromDraft(draft),
    ...collectAllowedPricesFromCatalog(catalogBlocks),
  ]);

  if (!allowed.size) {
    return {
      ok: false,
      violations: [
        {
          id: "no-db-prices",
          message:
            "Нет цен из ShopDB для проверки КП — сначала подбор по каталогу (matchInquiryToDraft).",
          hint: "Не указывай цены из PDF; дождись блоков [Каталог · purolat.com].",
        },
      ],
      allowedCount: 0,
    };
  }

  const rows = parseMarkdownTable(content);
  if (rows.length < 2) {
    return { ok: true, violations: [], allowedCount: allowed.size };
  }

  const header = rows[0];
  const dataRows = rows.slice(1);
  const priceIdx = findPriceColumnIndex(header);
  const violations = [];

  if (priceIdx < 0) {
    return { ok: true, violations: [], allowedCount: allowed.size };
  }

  for (const row of dataRows) {
    const price = parseAmount(row[priceIdx]);
    if (!Number.isFinite(price) || price <= 0) continue;

    if (!priceMatchesAllowed(price, allowed, tol)) {
      violations.push({
        id: "price-not-in-shopdb",
        message: `Цена ${price} не найдена в ShopDB (допустимые: ${[...allowed].slice(0, 8).join(", ")}${allowed.size > 8 ? "…" : ""})`,
        hint: "Бери цену только из черновика КП / блоков [Каталог · purolat.com], не из PDF и не выдумывай.",
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

module.exports = {
  collectAllowedPricesFromDraft,
  collectAllowedPricesFromCatalog,
  validateQuotePricesFromDb,
};
