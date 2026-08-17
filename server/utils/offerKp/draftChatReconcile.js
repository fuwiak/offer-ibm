"use strict";

/**
 * Reconcile OfferKP draft (сводка) with inquiry and ShopDB evidence.
 *
 * 1) compareDraftToInquiry — detect missing lines/prices vs inquiry + catalog
 * 2) reproduceDraftFillMissing — keep priced exact/analog lines; rematch only gaps
 */

const { parseInquiryText } = require("./parseInquiry");
const {
  matchInquiryLine,
  buildDraftFromMatchedLines,
  buildLineMatchErrorFallback,
} = require("./matchInquiryLines");
const { catalogGross } = require("./catalogPrice");

/** Local copy — avoid circular require with autoQuoteArtifacts. */
function parseCatalogBlock(block = "") {
  const text = String(block || "").trim();
  if (!text) return null;
  const lines = text.split("\n");
  const header = lines[0] || "";
  const nameMatch = header.match(/\[Каталог ·[^\]]+\]\s*(.+)/);
  const name = (nameMatch?.[1] || header).trim();
  let price = null;
  let productId = null;
  let url = "";
  for (const line of lines) {
    const priceM = line.match(/Цена:\s*([\d.,]+)\s*(\w+)/i);
    if (priceM) price = parseFloat(priceM[1].replace(",", "."));
    const urlM = line.match(/Ссылка:\s*(\S+)/i);
    if (urlM) url = urlM[1];
    const idM = line.match(/ID товара.*:\s*(\d+)/i);
    if (idM) productId = idM[1];
  }
  if (!Number.isFinite(price) || price <= 0) return null;
  return { name, price, url, productId };
}

function normalizeKey(value = "") {
  return (
    String(value || "")
      .toLowerCase()
      .replace(/[–—−]/g, "-")
      .replace(/[х×]/gi, "x")
      // Cyrillic м before digits → Latin m (M10x25 size tokens)
      .replace(/м(\d)/gi, "m$1")
      .replace(/\s+/g, " ")
      .replace(/[^\p{L}\p{N}.x-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function roundMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100) / 100;
}

function isPricedAcceptedLine(line = {}) {
  if (!line || typeof line !== "object") return false;
  const matchType = String(line.matchType || "");
  if (matchType !== "exact" && matchType !== "analog") return false;
  const price = Number(line.unitPriceNet || line.unitPrice || 0);
  if (!(price > 0)) return false;
  const id = line.productId != null && String(line.productId).trim() !== "";
  const sku = String(line.article || line.sku || "").trim() !== "";
  return id || sku;
}

function lineRequestKey(line = {}) {
  return normalizeKey(
    line.requestedName || line.inquiryRaw || line.name || line.raw || ""
  );
}

function catalogEvidenceRows(catalogBlocks = []) {
  return (catalogBlocks || [])
    .map((block) => parseCatalogBlock(block))
    .filter(Boolean)
    .map((p) => ({
      requestedName: p.name,
      name: p.name,
      article: "",
      productId: p.productId || null,
      unitPriceNet: roundMoney(p.price),
      productUrl: p.url || "",
      source: "catalog_block",
    }));
}

/**
 * @returns {{
 *   draftLineCount: number,
 *   chatRowCount: number,
 *   catalogEvidenceCount: number,
 *   pricedDraftCount: number,
 *   missingIndexes: number[],
 *   priceGaps: object[],
 *   needsReproduce: boolean,
 * }}
 */
function compareDraftToInquiry({
  draft = null,
  catalogBlocks = [],
  inquiryText = "",
} = {}) {
  const inquiryLines = inquiryText ? parseInquiryText(inquiryText) : [];
  const draftLines = Array.isArray(draft?.lines) ? draft.lines : [];
  const catalogRows = catalogEvidenceRows(catalogBlocks);
  const expected = inquiryLines.length || draftLines.length;

  const pricedDraftCount = draftLines.filter(isPricedAcceptedLine).length;
  const missingIndexes = [];
  const priceGaps = [];

  for (let i = 0; i < expected; i++) {
    const draftLine = draftLines[i] || null;
    const inquiry = inquiryLines[i] || null;
    const key = normalizeKey(
      draftLine
        ? lineRequestKey(draftLine)
        : inquiry?.name || inquiry?.raw || ""
    );
    const catalogHit = catalogRows.find(
      (c) =>
        key &&
        (normalizeKey(c.name).includes(key.slice(0, 24)) ||
          key.includes(normalizeKey(c.name).slice(0, 24)))
    );
    if (!isPricedAcceptedLine(draftLine)) {
      missingIndexes.push(i);
      if (catalogHit?.unitPriceNet) {
        priceGaps.push({
          index: i,
          draftPrice: roundMoney(draftLine?.unitPriceNet),
          chatPrice: null,
          chatSku: null,
          catalogPrice: catalogHit?.unitPriceNet || null,
          requestedName: draftLine?.requestedName || inquiry?.name || null,
        });
      }
    }
  }

  return {
    draftLineCount: draftLines.length,
    expectedLineCount: expected,
    chatRowCount: 0,
    chatProductBlockCount: 0,
    catalogEvidenceCount: catalogRows.length,
    pricedDraftCount,
    missingIndexes,
    priceGaps,
    needsReproduce:
      missingIndexes.length > 0 ||
      draftLines.length !== expected ||
      priceGaps.some((gap) => gap.catalogPrice),
  };
}

function findKeptLine(existingLines, inquiryLine, index) {
  const byIndex = existingLines[index];
  if (isPricedAcceptedLine(byIndex)) return byIndex;
  const key = normalizeKey(inquiryLine?.name || inquiryLine?.raw || "");
  if (!key) return null;
  return (
    existingLines.find(
      (line) =>
        isPricedAcceptedLine(line) &&
        (lineRequestKey(line) === key ||
          lineRequestKey(line).includes(key.slice(0, 32)) ||
          key.includes(lineRequestKey(line).slice(0, 32)))
    ) || null
  );
}

/**
 * Pad/merge without wiping good priced matches (fixes autoQuoteArtifacts wipe).
 */
function mergeKeepGoodPadMissing({
  draft = null,
  inquiryLines = [],
  unmatchedFactory = null,
} = {}) {
  const existing = Array.isArray(draft?.lines) ? draft.lines : [];
  if (!inquiryLines.length) {
    return (
      draft || { lines: existing, subtotal: 0, total: 0, totalWeightKg: 0 }
    );
  }

  const makeStub =
    typeof unmatchedFactory === "function"
      ? unmatchedFactory
      : (line) => {
          const quantity = Number(line.quantity);
          return {
            inquiryRaw: line.raw,
            name: line.name || line.raw,
            requestedName: line.name || line.raw,
            article: "",
            productId: "",
            quantity: Number.isFinite(quantity) ? quantity : 1,
            unit: line.unit || "шт",
            priceWithVat: 0,
            unitPriceNet: 0,
            lineTotal: 0,
            weightKg: 0,
            status: "Нет в наличии",
            kpStatus: "Нет в базе",
            unitNeedsRecalc: Boolean(line.needsReview),
            matchType: "none",
            analogOf: null,
            similarSuggestion: null,
            comment:
              "Совпадение и подтверждённая цена в ShopDB отсутствуют — цена по запросу",
            thread: line.thread,
            alternatives: [],
          };
        };

  const merged = inquiryLines.map((inquiryLine, index) => {
    const kept = findKeptLine(existing, inquiryLine, index);
    if (kept) return kept;
    const prior = existing[index];
    if (prior && (prior.productId || prior.article || prior.matchType)) {
      return prior;
    }
    return makeStub(inquiryLine);
  });

  return buildDraftFromMatchedLines(merged);
}

/**
 * Apply ShopDB-backed catalog evidence onto an incomplete draft line (no LLM invent).
 */
function applyCatalogEvidenceToLine(line, catalogRows = []) {
  if (!line || isPricedAcceptedLine(line)) return line;
  const rows = Array.isArray(catalogRows) ? catalogRows : [];
  const key = lineRequestKey(line);
  const cardName = line.name || line.requestedName || "";
  const hit =
    rows.find((c) => {
      if (!(c.unitPriceNet > 0 && c.productId)) return false;
      return (
        normalizeKey(cardName) === normalizeKey(c.name || "") ||
        (key &&
          (normalizeKey(c.name).includes(key.slice(0, 24)) ||
            key.includes(normalizeKey(c.name).slice(0, 24))))
      );
    }) || null;
  if (!hit) return line;
  const qty = Number(line.quantity) || 1;
  const unitPriceNet = hit.unitPriceNet;
  const priceWithVat = catalogGross(unitPriceNet);
  return {
    ...line,
    name: hit.name || line.name,
    productId: String(hit.productId),
    article: line.article || hit.article || "",
    unitPriceNet,
    priceWithVat,
    lineTotal: Number((unitPriceNet * qty).toFixed(2)),
    matchType: line.matchType === "analog" ? "analog" : "exact",
    allowPrice: true,
    kpStatus:
      line.matchType === "analog" ? "Предложен аналог" : "Точное соответствие",
    productUrl: hit.productUrl || line.productUrl || "",
    comment: line.comment || "Цена из блока каталога ShopDB (reconcile)",
    matchSource: line.matchSource || "catalog_block",
  };
}

/**
 * Build a draft line from a ShopDB product hit (live price only).
 */
/**
 * Keep current good ShopDB draft lines; rematch only missing/incomplete
 * inquiry indexes. Generated chat text is deliberately ignored.
 */
async function reproduceDraftFillMissing({
  draft = null,
  inquiryText = "",
  catalogBlocks = [],
  matchLine = matchInquiryLine,
  options = {},
} = {}) {
  const inquiryLines = parseInquiryText(inquiryText);
  if (!inquiryLines.length) {
    return {
      draft: draft || { lines: [], subtotal: 0, total: 0 },
      kept: 0,
      rematched: 0,
      fromChatSku: 0,
      fromChatCards: 0,
      comparison: compareDraftToInquiry({
        draft,
        inquiryText,
        catalogBlocks,
      }),
    };
  }

  const existing = Array.isArray(draft?.lines) ? [...draft.lines] : [];
  const catalogRows = catalogEvidenceRows(catalogBlocks);
  const comparison = compareDraftToInquiry({
    draft,
    inquiryText,
    catalogBlocks,
  });

  let kept = 0;
  let rematched = 0;
  const out = [];

  for (let i = 0; i < inquiryLines.length; i++) {
    const inquiryLine = inquiryLines[i];
    const keptLine = findKeptLine(existing, inquiryLine, i);
    if (keptLine) {
      kept += 1;
      out.push(keptLine);
      continue;
    }

    let line = existing[i] || null;
    if (line) line = applyCatalogEvidenceToLine(line, catalogRows);
    if (isPricedAcceptedLine(line)) {
      kept += 1;
      out.push(line);
      continue;
    }

    try {
      const matched = await matchLine(inquiryLine, {
        ...options,
        requestId: options.requestId || null,
      });
      rematched += 1;
      out.push(applyCatalogEvidenceToLine(matched, catalogRows));
    } catch (error) {
      rematched += 1;
      out.push(
        applyCatalogEvidenceToLine(
          buildLineMatchErrorFallback(inquiryLine, error),
          catalogRows
        )
      );
    }
  }

  return {
    draft: buildDraftFromMatchedLines(out),
    kept,
    rematched,
    fromChatSku: 0,
    fromChatCards: 0,
    comparison,
  };
}

/**
 * Replace an existing markdown KP table in chat text with grounded draft markdown,
 * or append when chat had no table (keeps prose above the table).
 */
function alignChatTextWithDraftMarkdown(chatText = "", draftMarkdown = "") {
  const md = String(draftMarkdown || "").trim();
  if (!md) return chatText;
  const text = String(chatText || "");
  const tableStart = text.search(/^\|\s*\d+\s*\|/m);
  if (tableStart < 0) {
    return `${text.trim()}\n\n${md}`.trim();
  }
  // Drop from first data-row table through contiguous table/separator lines.
  const lines = text.slice(tableStart).split("\n");
  let i = 0;
  // include optional header rows immediately above if present
  const before = text.slice(0, tableStart);
  const beforeLines = before.split("\n");
  let headerBack = 0;
  while (
    headerBack < beforeLines.length &&
    /^\|/.test(beforeLines[beforeLines.length - 1 - headerBack] || "")
  ) {
    headerBack += 1;
  }
  const prefix = beforeLines
    .slice(0, beforeLines.length - headerBack)
    .join("\n");
  while (i < lines.length && (/^\|/.test(lines[i]) || lines[i].trim() === "")) {
    i += 1;
  }
  const suffix = lines.slice(i).join("\n");
  return `${prefix.trim()}\n\n${md}\n\n${suffix.trim()}`.trim();
}

module.exports = {
  normalizeKey,
  isPricedAcceptedLine,
  catalogEvidenceRows,
  compareDraftToInquiry,
  mergeKeepGoodPadMissing,
  applyCatalogEvidenceToLine,
  reproduceDraftFillMissing,
  alignChatTextWithDraftMarkdown,
};
