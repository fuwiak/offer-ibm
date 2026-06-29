"use strict";

const { parseAmount } = require("./quoteCalculator");
const {
  parseThresholdsFromEnv,
  ABSTAIN_MESSAGE,
} = require("../../config/offerKp.harnessAntiHallucination");
const {
  extractCatalogBlocksFromText,
  extractCatalogBlocksFromChatHistory,
} = require("./catalogPrompt");

/**
 * @typedef {{ name: string, productId: string|null, prices: number[], skus: string[], raw: string }} CatalogEvidenceEntry
 */

/**
 * @param {string[]} blocks
 * @returns {CatalogEvidenceEntry[]}
 */
function parseCatalogEvidence(blocks = []) {
  const entries = [];
  for (const block of blocks) {
    const raw = String(block || "").trim();
    if (!raw) continue;

    const header = raw.split("\n")[0] || "";
    const name = header.replace(/^\[Каталог[^\]]*\]\s*/i, "").trim();

    const productIdMatch = raw.match(/ID товара[^:]*:\s*(\d+)/i);
    const productId = productIdMatch ? productIdMatch[1] : null;

    const prices = [];
    for (const match of raw.matchAll(/Цена:\s*([\d\s.,]+)/gi)) {
      const n = parseAmount(match[1]);
      if (Number.isFinite(n) && n > 0) prices.push(n);
    }
    for (const match of raw.matchAll(/—\s*([\d\s.,]+)\s*(?:RUB|руб)?/gi)) {
      const n = parseAmount(match[1]);
      if (Number.isFinite(n) && n > 0) prices.push(n);
    }

    const skus = [];
    const skuSection = raw.match(/SKU[^:]*:\s*\n([\s\S]*?)(?:\n[A-ZА-ЯЁ]|$)/i);
    if (skuSection?.[1]) {
      for (const skuLine of skuSection[1].matchAll(/·\s*([^\s—]+)/g)) {
        const sku = String(skuLine[1] || "").trim();
        if (sku) skus.push(sku);
      }
    }

    entries.push({
      name,
      productId,
      prices: [...new Set(prices.map((p) => Math.round(p * 100) / 100))],
      skus,
      raw,
    });
  }
  return entries;
}

/**
 * @param {string[]} blocks
 * @param {{ question?: string }} [options]
 * @returns {{ grade: number, reason: string, blockCount: number, pricedBlocks: number }}
 */
function gradeCatalogEvidence(
  blocks = [],
  { question = "", pdfInquiry = false } = {}
) {
  const list = (blocks || []).filter(Boolean);
  const thresholds = parseThresholdsFromEnv();

  if (!list.length) {
    if (pdfInquiry) {
      return {
        grade: thresholds.pdfInquiryMinGrade,
        reason: "pdf_inquiry",
        blockCount: 0,
        pricedBlocks: 0,
      };
    }
    return { grade: 0, reason: "no_catalog", blockCount: 0, pricedBlocks: 0 };
  }

  const pricedBlocks = list.filter((b) => /Цена:\s*[\d.,]+/i.test(b)).length;
  if (pricedBlocks === 0) {
    const grade = pdfInquiry ? thresholds.pdfInquiryMinGrade : 0.15;
    return {
      grade,
      reason: pdfInquiry ? "pdf_inquiry" : "no_prices",
      blockCount: list.length,
      pricedBlocks: 0,
    };
  }

  let grade = 0.35 + Math.min(0.45, pricedBlocks * 0.12);
  if (list.length >= thresholds.minCatalogBlocks) grade += 0.1;

  const q = String(question || "").trim();
  if (q && list.some((b) => tokenOverlapScore(q, b) > 0.15)) {
    grade += 0.15;
  }

  if (pdfInquiry) {
    grade = Math.max(grade, thresholds.pdfInquiryMinGrade);
  }

  grade = Math.min(1, Math.round(grade * 100) / 100);
  return {
    grade,
    reason:
      grade >= thresholds.cragOk
        ? "strong"
        : grade >= thresholds.cragBad
          ? "weak"
          : "thin",
    blockCount: list.length,
    pricedBlocks,
  };
}

function tokenOverlapScore(a = "", b = "") {
  const tokensA = new Set(
    String(a)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
  const tokensB = new Set(
    String(b)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
  if (!tokensA.size || !tokensB.size) return 0;
  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  return overlap / Math.max(tokensA.size, 1);
}

/**
 * @param {object} harness
 * @returns {string[]}
 */
function collectCatalogBlocksFromHarness(harness) {
  const chats = harness?.aibitat?._chats || [];
  const fromChats = extractCatalogBlocksFromChatHistory(chats, 20);
  if (fromChats.length) return fromChats;

  const prompt =
    harness?.ctx?.invocation?.prompt ||
    chats
      .slice()
      .reverse()
      .find((m) => /USER|HUMAN/i.test(m?.from || m?.role || ""))?.content ||
    "";
  return extractCatalogBlocksFromText(String(prompt || ""));
}

/**
 * @param {string} content
 * @param {string[]} catalogBlocks
 * @param {{ tolerance?: number }} [options]
 * @returns {{ ok: boolean, violations: Array<{ id: string, message: string, hint?: string }> }}
 */
function validateQuotePricesAgainstCatalog(
  content = "",
  catalogBlocks = [],
  { tolerance } = {}
) {
  const thresholds = parseThresholdsFromEnv();
  const tol = tolerance ?? thresholds.priceTolerance;
  const violations = [];

  const entries = parseCatalogEvidence(catalogBlocks);
  const allowedPrices = new Set();
  for (const entry of entries) {
    for (const p of entry.prices) allowedPrices.add(p);
  }

  if (!allowedPrices.size) {
    return { ok: true, violations: [] };
  }

  const rows = parseMarkdownTableRows(content);
  if (rows.dataRows.length === 0) return { ok: true, violations: [] };

  const { priceIdx } = rows.columns;
  if (priceIdx < 0) return { ok: true, violations: [] };

  for (const row of rows.dataRows) {
    const price = parseAmount(row[priceIdx]);
    if (!Number.isFinite(price) || price <= 0) continue;

    const matched = [...allowedPrices].some(
      (allowed) => Math.abs(allowed - price) <= tol
    );
    if (!matched) {
      violations.push({
        id: "catalog-price-mismatch",
        message: `Цена ${price} не найдена в подставленных блоках каталога`,
        hint: "Используй только цены из [Каталог · purolat.com] или убери строку.",
      });
      break;
    }
  }

  return { ok: violations.length === 0, violations };
}

function parseMarkdownTableRows(content = "") {
  const lines = String(content || "").split("\n");
  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;
    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length) rows.push(cells);
  }

  const header = rows[0] || [];
  const dataRows = rows.length > 1 ? rows.slice(1) : [];
  const priceIdx = headerIndex(header, [/цен/, /price/, /cena/, /rub/]);
  return { header, dataRows, columns: { priceIdx } };
}

function headerIndex(headerRow = [], patterns = []) {
  for (let i = 0; i < headerRow.length; i++) {
    const cell = String(headerRow[i] || "").toLowerCase();
    if (patterns.some((re) => re.test(cell))) return i;
  }
  return -1;
}

function shouldAbstainFromEvidence(
  gradeResult,
  thresholds = parseThresholdsFromEnv(),
  { pdfInquiry = false } = {}
) {
  if (pdfInquiry) return false;
  if (!gradeResult) return true;
  return gradeResult.grade < thresholds.cragBad;
}

/**
 * Определяет, есть ли в треде PDF-заявка с позициями/ценами.
 * @param {object} harness
 * @returns {Promise<boolean>}
 */
async function ensurePdfInquiryEvidence(harness) {
  if (harness?.state?.has("pdfInquiryEvidence")) {
    return Boolean(harness.state.get("pdfInquiryEvidence"));
  }

  const workspace = harness?.ctx?.workspace;
  const invocation = harness?.ctx?.invocation;
  if (!workspace?.id) {
    harness?.state?.set("pdfInquiryEvidence", false);
    return false;
  }

  let hasPdf = false;
  try {
    const { WorkspaceParsedFiles } = require("../../models/workspaceParsedFiles");
    const { parsedTextHasQuoteSignals } = require("./quotePdfModelRouter");
    const threadId = invocation?.thread_id || null;
    const userId = invocation?.user_id || null;
    const files = await WorkspaceParsedFiles.getContextFiles(
      workspace,
      threadId ? { id: threadId } : null,
      userId ? { id: userId } : null
    );
    const texts = (files || []).map((doc) => doc.pageContent).filter(Boolean);
    hasPdf = texts.some((text) => parsedTextHasQuoteSignals(text));
  } catch {
    hasPdf = false;
  }

  harness?.state?.set("pdfInquiryEvidence", hasPdf);
  return hasPdf;
}

function hasPdfInquiryEvidence(harness) {
  return Boolean(harness?.state?.get("pdfInquiryEvidence"));
}

function formatEvidenceAbstention(reason = "unsupported_claims") {
  return {
    status: "abstained",
    reason,
    message: ABSTAIN_MESSAGE,
  };
}

module.exports = {
  parseCatalogEvidence,
  gradeCatalogEvidence,
  collectCatalogBlocksFromHarness,
  validateQuotePricesAgainstCatalog,
  shouldAbstainFromEvidence,
  ensurePdfInquiryEvidence,
  hasPdfInquiryEvidence,
  formatEvidenceAbstention,
  tokenOverlapScore,
};
