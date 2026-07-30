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
    if (
      /\bзаявк|\boffered|\bартикул|\bкол-во/i.test(line) &&
      /\|\s*#\s*\|/i.test(line) === false
    ) {
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

/**
 * Parse LLM chat catalog cards:
 *   Товар: …
 *   Цена: 12.50 RUB
 *   Артикул / SKU: …
 *   Ссылка: …
 */
function extractChatProductBlocks(chatText = "") {
  const text = String(chatText || "");
  if (
    !/Товар\s*:/i.test(text) &&
    !/Артикул\s*(?:\/\s*SKU)?\s*:/i.test(text) &&
    !/\bSKU\s*:/i.test(text)
  ) {
    return [];
  }
  const chunks = text.split(/(?=^\s*(?:\*\*)?Товар\s*:)/im).filter(Boolean);
  const rows = [];
  for (const chunk of chunks) {
    if (!/Товар\s*:/i.test(chunk)) continue;
    const nameM = chunk.match(/Товар\s*:\s*(.+)/i);
    const priceM = chunk.match(/Цена\s*:\s*([\d\s.,]+)\s*(\w+)?/i);
    const skuM =
      chunk.match(/Артикул\s*\/\s*SKU\s*:\s*([^\s\n*|]+)/i) ||
      chunk.match(/Артикул\s*:\s*([^\s\n*|]+)/i) ||
      chunk.match(/\bSKU\s*:\s*([^\s\n*|]+)/i);
    const urlM = chunk.match(/Ссылка\s*:\s*(\S+)/i);
    const name = (nameM?.[1] || "").replace(/\*+/g, "").trim();
    const sku = (skuM?.[1] || "").replace(/\*+/g, "").trim();
    const price = roundMoney(
      String(priceM?.[1] || "")
        .replace(/\s/g, "")
        .replace(",", ".")
    );
    if (!name && !sku) continue;
    rows.push({
      index: rows.length,
      requestedName: name,
      name,
      article: sku,
      unitPriceNet: price,
      productUrl: (urlM?.[1] || "").replace(/[)\].,;]+$/, ""),
      source: "chat_product_block",
    });
  }
  return rows;
}

function extractSizeToken(key = "") {
  const m = String(key).match(/[mм]\d+(?:[.,]\d+)?(?:x\d+(?:[.,]\d+)?){0,3}/i);
  return m ? m[0].toLowerCase().replace(/,/g, ".").replace(/^м/, "m") : "";
}

function extractStandardToken(key = "") {
  const din = String(key).match(/din\s*\d+[-\d]*/i);
  if (din) return din[0].replace(/\s+/g, "");
  const gost = String(key).match(
    /(?:gost|гост)\s*(?:r\s*)?(?:iso\s*)?[\d.]+(?:-\d+)*/i
  );
  if (gost) return gost[0].replace(/\s+/g, "");
  return "";
}

/** Reject wrong SKU→line pairs (e.g. M6 SKU glued onto M10 inquiry). */
function namesCompatible(a = "", b = "") {
  const ka = normalizeKey(a);
  const kb = normalizeKey(b);
  if (!ka || !kb) return false;
  const sizeA = extractSizeToken(ka);
  const sizeB = extractSizeToken(kb);
  if (sizeA && sizeB && sizeA !== sizeB) return false;
  const stdA = extractStandardToken(ka);
  const stdB = extractStandardToken(kb);
  if (stdA && stdB && stdA !== stdB) return false;
  if (ka === kb) return true;
  if (ka.includes(kb.slice(0, 28)) || kb.includes(ka.slice(0, 28))) return true;
  const tokensA = new Set(ka.split(" ").filter((t) => t.length > 2));
  const tokensB = kb.split(" ").filter((t) => t.length > 2);
  if (!tokensB.length) return false;
  let hit = 0;
  for (const t of tokensB) if (tokensA.has(t)) hit += 1;
  return hit / tokensB.length >= 0.4;
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

function allChatEvidenceRows(chatText = "", catalogBlocks = []) {
  const table = extractChatTableRows(chatText);
  const products = extractChatProductBlocks(chatText);
  const catalog = catalogEvidenceRows(catalogBlocks);
  return { table, products, catalog, all: [...table, ...products, ...catalog] };
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
  const evidence = allChatEvidenceRows(chatText, catalogBlocks);
  const chatRows = evidence.products.length
    ? evidence.products
    : evidence.table;
  const catalogRows = evidence.catalog;
  const expected =
    inquiryLines.length ||
    Math.max(draftLines.length, chatRows.length, evidence.products.length);

  const pricedDraftCount = draftLines.filter(isPricedAcceptedLine).length;
  const missingIndexes = [];
  const priceGaps = [];

  for (let i = 0; i < expected; i++) {
    const draftLine = draftLines[i] || null;
    const chatRow = chatRows.find((r) => r.index === i) || chatRows[i] || null;
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
    const chatHint =
      chatRow &&
      namesCompatible(key, chatRow.name || chatRow.requestedName || "")
        ? chatRow
        : evidence.products.find((p) =>
            namesCompatible(key, p.name || p.requestedName || "")
          ) || null;

    if (!isPricedAcceptedLine(draftLine)) {
      missingIndexes.push(i);
      if (
        (chatHint?.unitPriceNet && chatHint.article) ||
        catalogHit?.unitPriceNet
      ) {
        priceGaps.push({
          index: i,
          draftPrice: roundMoney(draftLine?.unitPriceNet),
          chatPrice: chatHint?.unitPriceNet || null,
          chatSku: chatHint?.article || null,
          catalogPrice: catalogHit?.unitPriceNet || null,
          requestedName:
            draftLine?.requestedName ||
            inquiry?.name ||
            chatHint?.requestedName ||
            null,
        });
      }
    } else if (
      chatHint?.unitPriceNet &&
      Math.abs(Number(draftLine.unitPriceNet) - chatHint.unitPriceNet) > 0.05
    ) {
      priceGaps.push({
        index: i,
        draftPrice: roundMoney(draftLine.unitPriceNet),
        chatPrice: chatHint.unitPriceNet,
        chatSku: chatHint.article || null,
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
    chatProductBlockCount: evidence.products.length,
    catalogEvidenceCount: catalogRows.length,
    pricedDraftCount,
    missingIndexes,
    priceGaps,
    needsReproduce:
      missingIndexes.length > 0 ||
      draftLines.length !== expected ||
      evidence.products.length > draftLines.length ||
      priceGaps.some((g) => !g.mismatch && (g.catalogPrice || g.chatSku)),
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
 * Build a draft line from a ShopDB product hit (live price only).
 */
function draftLineFromShopProduct(inquiryLine, product, matchedSku = "") {
  const qty = Number(inquiryLine.quantity);
  const quantity = Number.isFinite(qty) ? qty : 1;
  const unitPriceNet = roundMoney(product.price) || 0;
  const unitNeedsRecalc = Boolean(inquiryLine.needsReview);
  const priceWithVat = unitPriceNet
    ? Number((unitPriceNet * (1 + VAT_RATE)).toFixed(2))
    : 0;
  const lineTotal =
    unitPriceNet > 0 && !unitNeedsRecalc
      ? Number((unitPriceNet * quantity).toFixed(2))
      : 0;
  return {
    inquiryRaw: inquiryLine.raw,
    name: product.name || inquiryLine.name || inquiryLine.raw,
    requestedName: inquiryLine.name || inquiryLine.raw,
    article: matchedSku || product.matched_sku || product.sku || "",
    productId: product.id != null ? String(product.id) : "",
    quantity,
    unit: inquiryLine.unit || "шт",
    priceWithVat,
    unitPriceNet,
    lineTotal,
    weightKg: 0,
    status: unitPriceNet > 0 ? "В наличии" : "Нет в наличии",
    kpStatus: unitPriceNet > 0 ? "Точное соответствие" : "Цена по запросу",
    unitNeedsRecalc,
    matchType: "exact",
    analogOf: null,
    similarSuggestion: null,
    comment: "Сопоставлено по SKU из ответа чата, цена из ShopDB",
    thread: inquiryLine.thread,
    alternatives: [],
    productUrl: product.url || product.product_url || "",
    matchSource: "chat_sku_verified",
  };
}

/**
 * If chat suggests a SKU compatible with the inquiry line, verify in ShopDB
 * and return a priced draft line. Never trusts LLM price alone.
 */
async function tryFillFromChatSku(inquiryLine, chatHint, searchByExactSku) {
  const sku = String(chatHint?.article || "").trim();
  if (!sku || typeof searchByExactSku !== "function") return null;
  const inquiryName = inquiryLine.name || inquiryLine.raw || "";
  const chatName = chatHint.name || chatHint.requestedName || "";
  if (chatName && !namesCompatible(inquiryName, chatName)) return null;

  const hits = await searchByExactSku([sku], 3);
  if (!Array.isArray(hits) || !hits.length) return null;
  const product =
    hits.find((h) => namesCompatible(inquiryName, h.name || "")) || null;
  // SKU must match inquiry size/standard — do not accept unrelated catalog hit.
  if (!product) return null;
  return draftLineFromShopProduct(inquiryLine, product, sku);
}

/**
 * Pick inquiry qty/name for a chat card (by compatible name, else index).
 */
function pickInquiryForChatCard(inquiryLines = [], card = {}, index = 0) {
  const cardName = card.name || card.requestedName || "";
  const byName = inquiryLines.find((line) =>
    namesCompatible(line.name || line.raw || "", cardName)
  );
  if (byName) return byName;
  return inquiryLines[index] || null;
}

function syntheticInquiryFromCard(card = {}, inquiry = null) {
  const quantity = Number(inquiry?.quantity);
  return {
    raw: inquiry?.raw || card.name || "",
    name: inquiry?.name || card.name || "",
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    unit: inquiry?.unit || "шт",
    thread: inquiry?.thread || null,
    needsReview: Boolean(inquiry?.needsReview),
  };
}

/**
 * Authoritative draft: one сводка line per chat Товар card (order preserved).
 * Price only after ShopDB SKU verify; otherwise rematch by card name / stub.
 */
async function buildDraftFromChatProductCards({
  chatText = "",
  inquiryText = "",
  matchLine = matchInquiryLine,
  searchByExactSku = null,
  options = {},
} = {}) {
  const cards = extractChatProductBlocks(chatText);
  if (!cards.length) {
    return {
      draft: null,
      fromChatCards: 0,
      fromChatSku: 0,
      rematched: 0,
    };
  }

  if (typeof searchByExactSku !== "function") {
    try {
      searchByExactSku = require("./productSearchAgent").searchByExactSku;
    } catch {
      searchByExactSku = null;
    }
  }

  const inquiryLines = inquiryText ? parseInquiryText(inquiryText) : [];
  let fromChatSku = 0;
  let rematched = 0;
  const out = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const inquiry = pickInquiryForChatCard(inquiryLines, card, i);
    const syn = syntheticInquiryFromCard(card, inquiry);

    let line = null;
    if (card.article && searchByExactSku) {
      // Exact SKU hit from ShopDB is authoritative for this card row.
      // Prefer name-compatible product; otherwise still take first SKU hit
      // (LLM may paraphrase ГОСТ/coating) so chatSku≠0 and prices land in сводка.
      const sku = String(card.article).trim();
      let hits = [];
      try {
        hits = await searchByExactSku([sku], 3);
      } catch (e) {
        console.warn(
          `[offerKp] chat card SKU lookup failed ${sku}:`,
          e?.message || e
        );
      }
      if (Array.isArray(hits) && hits.length) {
        const product =
          hits.find((h) => namesCompatible(card.name || "", h.name || "")) ||
          hits.find((h) => namesCompatible(syn.name || "", h.name || "")) ||
          hits[0];
        if (product) {
          line = draftLineFromShopProduct(syn, product, sku);
          fromChatSku += 1;
          if (
            card.name &&
            product.name &&
            !namesCompatible(card.name, product.name)
          ) {
            line.comment =
              (line.comment || "") +
              " (SKU из чата; название ShopDB отличается от карточки)";
          }
        }
      }
    }

    if (!line) {
      try {
        line = await matchLine(syn, {
          ...options,
          requestId: options.requestId || null,
        });
        rematched += 1;
      } catch (error) {
        rematched += 1;
        line = buildLineMatchErrorFallback(syn, error);
      }
      if (line && !line.matchSource) {
        line.matchSource = "chat_card_rematch";
      }
    }

    line.requestedName = syn.name || line.requestedName;
    if (!line.name) line.name = card.name;
    if (card.productUrl && !line.productUrl) line.productUrl = card.productUrl;
    line.fromChatCard = true;
    out.push(line);
  }

  return {
    draft: buildDraftFromMatchedLines(out),
    fromChatCards: cards.length,
    fromChatSku,
    rematched,
  };
}

/**
 * Keep current good draft lines; rematch only missing/incomplete indexes.
 * Prefer chat Товар/SKU cards → ShopDB verify before full matchInquiryLine.
 */
async function reproduceDraftFillMissing({
  draft = null,
  inquiryText = "",
  catalogBlocks = [],
  matchLine = matchInquiryLine,
  searchByExactSku = null,
  options = {},
} = {}) {
  const chatText = options.chatText || "";
  const chatCards = extractChatProductBlocks(chatText);

  // When chat lists catalog cards, they define the сводка rows 1:1.
  if (chatCards.length > 0) {
    const built = await buildDraftFromChatProductCards({
      chatText,
      inquiryText,
      matchLine,
      searchByExactSku,
      options,
    });
    const comparison = compareDraftToChat({
      draft: built.draft,
      inquiryText,
      catalogBlocks,
      chatText,
    });
    return {
      draft: built.draft,
      kept: 0,
      rematched: built.rematched,
      fromChatSku: built.fromChatSku,
      fromChatCards: built.fromChatCards,
      comparison,
    };
  }

  const inquiryLines = parseInquiryText(inquiryText);
  if (!inquiryLines.length) {
    return {
      draft: draft || { lines: [], subtotal: 0, total: 0 },
      kept: 0,
      rematched: 0,
      fromChatSku: 0,
      fromChatCards: 0,
      comparison: compareDraftToChat({
        draft,
        inquiryText,
        catalogBlocks,
        chatText,
      }),
    };
  }

  if (typeof searchByExactSku !== "function") {
    try {
      searchByExactSku = require("./productSearchAgent").searchByExactSku;
    } catch {
      searchByExactSku = null;
    }
  }

  const existing = Array.isArray(draft?.lines) ? [...draft.lines] : [];
  const catalogRows = catalogEvidenceRows(catalogBlocks);
  const evidence = allChatEvidenceRows(chatText, catalogBlocks);
  const chatProducts = evidence.products;
  const comparison = compareDraftToChat({
    draft,
    inquiryText,
    catalogBlocks,
    chatText,
  });

  let kept = 0;
  let rematched = 0;
  let fromChatSku = 0;
  const out = [];
  const usedChatIndexes = new Set();

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

    let chatHint =
      chatProducts[i] &&
      namesCompatible(
        inquiryLine.name || inquiryLine.raw || "",
        chatProducts[i].name || ""
      )
        ? chatProducts[i]
        : null;
    if (!chatHint) {
      chatHint =
        chatProducts.find(
          (p, idx) =>
            !usedChatIndexes.has(idx) &&
            namesCompatible(
              inquiryLine.name || inquiryLine.raw || "",
              p.name || ""
            )
        ) || null;
    }

    if (chatHint?.article) {
      const filled = await tryFillFromChatSku(
        inquiryLine,
        chatHint,
        searchByExactSku
      );
      if (filled && isPricedAcceptedLine(filled)) {
        fromChatSku += 1;
        const chatIdx = chatProducts.indexOf(chatHint);
        if (chatIdx >= 0) usedChatIndexes.add(chatIdx);
        out.push(filled);
        continue;
      }
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
    fromChatSku,
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
  extractChatTableRows,
  extractChatProductBlocks,
  namesCompatible,
  catalogEvidenceRows,
  compareDraftToChat,
  mergeKeepGoodPadMissing,
  applyCatalogEvidenceToLine,
  draftLineFromShopProduct,
  tryFillFromChatSku,
  pickInquiryForChatCard,
  buildDraftFromChatProductCards,
  reproduceDraftFillMissing,
  alignChatTextWithDraftMarkdown,
};
