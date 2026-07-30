"use strict";

/**
 * Reconcile OfferKP draft (сводка) with chat output.
 *
 * 1) compareDraftToChat — detect missing lines / prices vs chat + catalog blocks
 * 2) reproduceDraftFillMissing — keep priced exact/analog lines; rematch only gaps
 *
 * ShopDB-only: chat markdown prices apply only when backed by catalog block
 * productId/SKU evidence (never invent from free LLM prose).
 */

const { parseInquiryText } = require("./parseInquiry");
const {
  matchInquiryLine,
  buildDraftFromMatchedLines,
  buildLineMatchErrorFallback,
} = require("./matchInquiryLines");

const VAT_RATE = 0.2;

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
  return String(value || "")
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/[х×]/gi, "x")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}.x\-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

/**
 * Parse markdown KP table rows emitted to chat
 * (| # | requested | offered | article | status | unit | qty | price | ... |).
 */
function extractChatTableRows(chatText = "") {
  const rows = [];
  const lines = String(chatText || "").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    if (/^\|\s*-+/.test(line)) continue;
    if (/\bзаявк|\boffered|\bартикул|\bкол-во/i.test(line) && /\|\s*#\s*\|/i.test(line) === false) {
      // header-ish row without numeric index
      if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    }
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 8) continue;
    const idx = parseInt(cells[0], 10);
    if (!Number.isFinite(idx) || idx < 1) continue;
    const priceRaw = cells[7];
    const price = roundMoney(
      String(priceRaw || "")
        .replace(/\s/g, "")
        .replace(",", ".")
        .replace(/[^\d.]/g, "")
    );
    rows.push({
      index: idx - 1,
      requestedName: cells[1] || "",
      name: cells[2] || "",
      article: cells[3] === "—" ? "" : cells[3] || "",
      kpStatus: cells[4] || "",
      unit: cells[5] || "шт",
      quantity: Number(String(cells[6]).replace(/[^\d.]/g, "")) || null,
      unitPriceNet: price,
      source: "chat_table",
    });
  }
  return rows;
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
function compareDraftToChat({
  draft = null,
  chatText = "",
  catalogBlocks = [],
  inquiryText = "",
} = {}) {
  const inquiryLines = inquiryText ? parseInquiryText(inquiryText) : [];
  const draftLines = Array.isArray(draft?.lines) ? draft.lines : [];
  const chatRows = extractChatTableRows(chatText);
  const catalogRows = catalogEvidenceRows(catalogBlocks);
  const expected =
    inquiryLines.length ||
    Math.max(draftLines.length, chatRows.length);

  const pricedDraftCount = draftLines.filter(isPricedAcceptedLine).length;
  const missingIndexes = [];
  const priceGaps = [];

  for (let i = 0; i < expected; i++) {
    const draftLine = draftLines[i] || null;
    const chatRow = chatRows.find((r) => r.index === i) || null;
    const inquiry = inquiryLines[i] || null;
    const key = normalizeKey(
      draftLine
        ? lineRequestKey(draftLine)
        : inquiry?.name || inquiry?.raw || chatRow?.requestedName || ""
    );
    const catalogHit = catalogRows.find(
      (c) =>
        key &&
        (normalizeKey(c.name).includes(key.slice(0, 24)) ||
          key.includes(normalizeKey(c.name).slice(0, 24)))
    );

    if (!isPricedAcceptedLine(draftLine)) {
      missingIndexes.push(i);
      if (
        (chatRow?.unitPriceNet && chatRow.article) ||
        catalogHit?.unitPriceNet
      ) {
        priceGaps.push({
          index: i,
          draftPrice: roundMoney(draftLine?.unitPriceNet),
          chatPrice: chatRow?.unitPriceNet || null,
          catalogPrice: catalogHit?.unitPriceNet || null,
          requestedName:
            draftLine?.requestedName ||
            inquiry?.name ||
            chatRow?.requestedName ||
            null,
        });
      }
    } else if (
      chatRow?.unitPriceNet &&
      Math.abs(Number(draftLine.unitPriceNet) - chatRow.unitPriceNet) > 0.05
    ) {
      priceGaps.push({
        index: i,
        draftPrice: roundMoney(draftLine.unitPriceNet),
        chatPrice: chatRow.unitPriceNet,
        catalogPrice: catalogHit?.unitPriceNet || null,
        requestedName: draftLine.requestedName || null,
        mismatch: true,
      });
    }
  }

  return {
    draftLineCount: draftLines.length,
    expectedLineCount: expected,
    chatRowCount: chatRows.length,
    catalogEvidenceCount: catalogRows.length,
    pricedDraftCount,
    missingIndexes,
    priceGaps,
    needsReproduce:
      missingIndexes.length > 0 ||
      draftLines.length !== expected ||
      priceGaps.some((g) => !g.mismatch && g.catalogPrice),
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
    return draft || { lines: existing, subtotal: 0, total: 0, totalWeightKg: 0 };
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
  const key = lineRequestKey(line);
  const hit = catalogRows.find((c) => {
    const n = normalizeKey(c.name);
    return (
      c.unitPriceNet > 0 &&
      c.productId &&
      key &&
      (n.includes(key.slice(0, 24)) || key.includes(n.slice(0, 24)))
    );
  });
  if (!hit) return line;
  const qty = Number(line.quantity) || 1;
  const unitPriceNet = hit.unitPriceNet;
  const priceWithVat = Number((unitPriceNet * (1 + VAT_RATE)).toFixed(2));
  return {
    ...line,
    name: hit.name || line.name,
    productId: hit.productId,
    article: line.article || "",
    unitPriceNet,
    priceWithVat,
    lineTotal: Number((unitPriceNet * qty).toFixed(2)),
    matchType: line.matchType === "analog" ? "analog" : "exact",
    kpStatus:
      line.matchType === "analog" ? "Предложен аналог" : "Точное соответствие",
    productUrl: hit.productUrl || line.productUrl || "",
    comment: line.comment || "Цена из блока каталога ShopDB (reconcile)",
  };
}

/**
 * Keep current good draft lines; rematch only missing/incomplete indexes.
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
      comparison: compareDraftToChat({ draft, inquiryText, catalogBlocks }),
    };
  }

  const existing = Array.isArray(draft?.lines) ? [...draft.lines] : [];
  const catalogRows = catalogEvidenceRows(catalogBlocks);
  const comparison = compareDraftToChat({
    draft,
    inquiryText,
    catalogBlocks,
    chatText: options.chatText || "",
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
  let end = tableStart;
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
  const prefix = beforeLines.slice(0, beforeLines.length - headerBack).join("\n");
  while (i < lines.length && (/^\|/.test(lines[i]) || lines[i].trim() === "")) {
    i += 1;
  }
  const suffix = lines.slice(i).join("\n");
  return `${prefix.trim()}\n\n${md}\n\n${suffix.trim()}`.trim();
}

module.exports = {
  normalizeKey,
  isPricedAcceptedLine,
  extractChatTableRows,
  catalogEvidenceRows,
  compareDraftToChat,
  mergeKeepGoodPadMissing,
  applyCatalogEvidenceToLine,
  reproduceDraftFillMissing,
  alignChatTextWithDraftMarkdown,
};
