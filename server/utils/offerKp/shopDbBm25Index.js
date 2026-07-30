"use strict";

/**
 * Lightweight in-process BM25F index over the persisted ShopDB catalog
 * snapshot. No external search service is needed on Selectel.
 */

const { create, insertMultiple, search } = require("@orama/orama");
const { foldHomoglyphs, normalizeSearchText } = require("./textNormalize");

const FIELD_BOOSTS = Object.freeze({
  sku: 10,
  size: 8,
  standard: 7,
  name: 5,
  strength: 4,
  material: 3,
  coating: 3,
  category: 2,
  description: 0.5,
});

let cachedRecords = null;
let cachedIndex = null;

function enabled() {
  const raw = String(process.env.SHOP_DB_BM25 ?? "1")
    .trim()
    .toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function topK() {
  return Math.max(
    1,
    Math.min(100, parseInt(process.env.SHOP_DB_BM25_TOP_K, 10) || 40)
  );
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|quot|lt|gt);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function technicalTokens(value) {
  const prepared = cleanText(value)
    .toLowerCase()
    .replace(/гост/gu, "gost")
    .replace(/исо/gu, "iso");
  const raw = normalizeSearchText(foldHomoglyphs(prepared))
    .toLowerCase()
    .replace(/[×х]/gu, "x")
    .replace(/(\d),(\d)/g, "$1.$2");
  if (!raw) return [];

  const tokens = raw
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);

  for (const match of raw.matchAll(
    /\b(din|gost|гост|iso|исо)\s*-?\s*(\d+(?:-\d+)*)/giu
  )) {
    const family =
      match[1] === "гост" || match[1] === "исо"
        ? match[1] === "гост"
          ? "gost"
          : "iso"
        : match[1];
    tokens.push(`std${family}${match[2]}`, `stdnum${match[2]}`);
  }

  for (const match of raw.matchAll(
    /\bm\s*(\d+(?:\.\d+)?)\s*x\s*(?:(\d+(?:\.\d+)?)\s*x\s*)?(\d+(?:\.\d+)?)/giu
  )) {
    const diameter = match[1];
    const pitch = match[2] || "";
    const length = match[3];
    tokens.push(
      `diam${diameter}`,
      `len${length}`,
      `sizem${diameter}x${pitch ? `${pitch}x` : ""}${length}`
    );
    if (pitch) tokens.push(`pitch${pitch}`);
  }

  for (const match of raw.matchAll(/\bm\s*(\d+(?:\.\d+)?)(?![\d.]|\s*x)/giu)) {
    tokens.push(`diam${match[1]}`);
  }
  for (const match of raw.matchAll(/\b\d{8,18}\b/g)) {
    tokens.push(`sku${match[0]}`);
  }
  return tokens;
}

function sizeText(signature = {}) {
  const diameter = cleanText(signature.diameter);
  const length = cleanText(signature.length).replace(/\s*mm\b/i, "");
  const pitch = cleanText(signature.threadPitch);
  if (!diameter) return length;
  return length ? `${diameter}x${pitch ? `${pitch}x` : ""}${length}` : diameter;
}

function documentFields(record = {}) {
  const signature = record.signature || {};
  return {
    sku: (record.skuCodes || []).join(" "),
    size: sizeText(signature),
    standard: (signature.standards || []).join(" "),
    name: record.name,
    strength: signature.strengthClass,
    material: signature.material,
    coating: signature.coating,
    category: record.categoryName,
    description: `${record.summary || ""} ${record.description || ""}`,
  };
}

function searchableField(value) {
  const raw = cleanText(value);
  return `${raw} ${technicalTokens(raw).join(" ")}`.trim();
}

function createBm25Index(records = []) {
  const database = create({
    language: "russian",
    schema: {
      id: "string",
      sku: "string",
      size: "string",
      standard: "string",
      name: "string",
      strength: "string",
      material: "string",
      coating: "string",
      category: "string",
      description: "string",
    },
  });
  const recordById = new Map();
  const documents = [];
  for (const record of records) {
    const productId = Number(record.productId);
    if (!Number.isInteger(productId) || productId <= 0) continue;
    const fields = documentFields(record);
    recordById.set(String(productId), record);
    documents.push({
      id: String(productId),
      ...Object.fromEntries(
        Object.entries(fields).map(([field, value]) => [
          field,
          searchableField(value),
        ])
      ),
    });
  }
  if (documents.length) insertMultiple(database, documents);

  return {
    count: documents.length,
    search(queryText, limit = topK()) {
      const raw = cleanText(queryText);
      if (!raw) return [];
      const result = search(database, {
        mode: "fulltext",
        term: searchableField(raw),
        properties: Object.keys(FIELD_BOOSTS),
        boost: FIELD_BOOSTS,
        // Technical identifiers are exact. OCR/typo rescue belongs to the
        // separate dense e5 path; fuzzy BM25 can turn a one-digit SKU or M×L
        // difference into a false positive.
        tolerance: 0,
        limit: Math.max(1, Math.min(100, Number(limit) || topK())),
      });
      return result.hits.map((hit) => ({
        productId: Number(hit.id),
        score: Number(hit.score.toFixed(6)),
        record: recordById.get(String(hit.id)) || null,
      }));
    },
  };
}

function getShopDbBm25Index(records) {
  if (!enabled()) return null;
  if (cachedIndex && cachedRecords === records) return cachedIndex;
  cachedRecords = records;
  cachedIndex = createBm25Index(records);
  return cachedIndex;
}

function resetShopDbBm25Index() {
  cachedRecords = null;
  cachedIndex = null;
}

module.exports = {
  FIELD_BOOSTS,
  enabled,
  topK,
  technicalTokens,
  documentFields,
  createBm25Index,
  getShopDbBm25Index,
  resetShopDbBm25Index,
};
