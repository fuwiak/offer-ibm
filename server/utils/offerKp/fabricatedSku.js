"use strict";

/**
 * SKU grounding for OfferKP.
 *
 * Rules:
 * 1) Heuristic fillers (1000…000, all-zeros, fake/dummy) are never SKUs.
 * 2) Any SKU shown in chat / draft / export must be in the ShopDB allowlist
 *    for this turn (enrich blocks + priced draft lines with productId).
 * 3) No allowlist → strip every Артикул/SKU claim from model text.
 */

const PRICE_ELIGIBLE = new Set(["exact", "analog"]);

function normalizeSkuCandidate(value = "") {
  return String(value || "")
    .trim()
    .replace(/^[*`"']+|[*`"']+$/g, "")
    .trim();
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isFabricatedSku(value = "") {
  const raw = normalizeSkuCandidate(value);
  if (!raw) return false;

  if (
    /^(?:n\/?a|none|null|undefined|unknown|xxx+|test|fake|dummy|placeholder|пример|выдуман)$/i.test(
      raw
    )
  ) {
    return true;
  }

  // Identical char repeated (000000, 11111111, --------)
  if (/^(.)\1{5,}$/.test(raw)) return true;

  // Classic LLM filler: 10000000000000000000000000000000
  if (/^10{8,}$/.test(raw)) return true;
  if (/^0{6,}$/.test(raw)) return true;

  // Long digit-only blob dominated by one digit (≥85%, length ≥ 12)
  if (/^\d{12,}$/.test(raw)) {
    const freq = Object.create(null);
    for (const ch of raw) freq[ch] = (freq[ch] || 0) + 1;
    const max = Math.max(...Object.values(freq));
    if (max / raw.length >= 0.85) return true;
  }

  return false;
}

/**
 * @param {unknown} value
 * @returns {string} empty string when missing or fabricated
 */
function sanitizeSku(value = "") {
  const raw = normalizeSkuCandidate(value);
  if (!raw || isFabricatedSku(raw)) return "";
  return raw;
}

/**
 * SKU is grounded only if it survives sanitize AND is in the ShopDB allowlist.
 * Empty allowlist → nothing is grounded (fail closed for LLM text).
 *
 * @param {unknown} value
 * @param {Set<string>|string[]|null|undefined} allowedSkus
 * @returns {boolean}
 */
function isGroundedSku(value, allowedSkus) {
  const raw = sanitizeSku(value);
  if (!raw) return false;
  const allowed = toSkuSet(allowedSkus);
  if (!allowed.size) return false;
  return allowed.has(raw.toLowerCase());
}

/**
 * Keep SKU only when grounded against allowlist (or when allowlist is omitted
 * and the value merely passes the fabricated heuristic — used for ShopDB rows
 * themselves before the allowlist is built).
 *
 * @param {unknown} value
 * @param {Set<string>|string[]|null|undefined} [allowedSkus]
 * @returns {string}
 */
function groundSku(value, allowedSkus) {
  const raw = sanitizeSku(value);
  if (!raw) return "";
  if (allowedSkus == null) return raw;
  return isGroundedSku(raw, allowedSkus) ? raw : "";
}

function toSkuSet(allowedSkus) {
  if (!allowedSkus) return new Set();
  if (allowedSkus instanceof Set) {
    return new Set(
      [...allowedSkus]
        .map((s) =>
          String(s || "")
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    );
  }
  return new Set(
    [...(allowedSkus || [])]
      .map((s) =>
        String(s || "")
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );
}

/**
 * Draft/quote line may carry an article only with ShopDB product id +
 * exact/analog match (same contract as priced lines).
 * @param {object} line
 * @returns {boolean}
 */
function lineMayCarrySku(line = {}) {
  const productId = String(line?.productId || "").trim();
  if (!productId) return false;
  const matchType = String(line?.matchType || "").trim();
  if (matchType && !PRICE_ELIGIBLE.has(matchType)) return false;
  return true;
}

/**
 * Drop "Артикул / SKU: …" / bullet SKU lines that are fabricated or not in
 * the ShopDB allowlist. When allowlist is empty/null, strip ALL SKU claims
 * (LLM text must not invent артикулы).
 *
 * @param {string} text
 * @param {Set<string>|string[]|null|undefined} [allowedSkus]
 * @returns {string}
 */
function stripUngroundedSkusFromText(text = "", allowedSkus = null) {
  const allowed = allowedSkus == null ? null : toSkuSet(allowedSkus);
  const keep = (sku) => {
    const raw = sanitizeSku(sku);
    if (!raw) return false;
    if (allowed == null) return !isFabricatedSku(raw);
    if (!allowed.size) return false;
    return allowed.has(raw.toLowerCase());
  };

  let t = String(text || "");
  t = t.replace(
    /^[^\n]*(?:Артикул\s*(?:\/\s*SKU)?|\*{0,2}Артикул\*{0,2}\s*(?:\/\s*\*{0,2}SKU\*{0,2})?|SKU)\s*:\s*([^\s\n*|]+)[^\n]*$/gim,
    (line, sku) => (keep(sku) ? line : "")
  );
  t = t.replace(/^\s*·\s*([A-Za-z0-9._/-]+)\s*$/gm, (line, sku) =>
    /[0-9]/.test(sku) && !keep(sku) ? "" : line
  );
  t = t.replace(
    /((?:Артикул\s*(?:\/\s*SKU)?|SKU)\s*:\s*)([^\s\n*|]+)/gi,
    (full, _label, sku) => (keep(sku) ? full : "")
  );
  return t
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** @deprecated use stripUngroundedSkusFromText — alias keeps prior call sites. */
function stripFabricatedSkusFromText(text = "") {
  return stripUngroundedSkusFromText(text, null);
}

/**
 * Clear ungrounded article/sku fields on draft/quote lines.
 * @param {object[]} lines
 * @param {Set<string>|string[]|null|undefined} [allowedSkus]
 * @returns {object[]}
 */
function stripUngroundedSkusFromLines(lines = [], allowedSkus = null) {
  const allowed = allowedSkus == null ? null : toSkuSet(allowedSkus);
  return (lines || []).map((line) => {
    if (!line || typeof line !== "object") return line;
    const next = { ...line };
    if (!lineMayCarrySku(next)) {
      next.article = "";
      if (next.sku) next.sku = "";
      return next;
    }
    const article = sanitizeSku(next.article);
    const sku = sanitizeSku(next.sku);
    if (allowed && allowed.size) {
      next.article =
        article && allowed.has(article.toLowerCase()) ? article : "";
      next.sku = sku && allowed.has(sku.toLowerCase()) ? sku : "";
    } else {
      next.article = article;
      next.sku = sku;
    }
    return next;
  });
}

/** @deprecated alias */
function stripFabricatedSkusFromLines(lines = []) {
  return stripUngroundedSkusFromLines(lines, null);
}

module.exports = {
  isFabricatedSku,
  sanitizeSku,
  isGroundedSku,
  groundSku,
  lineMayCarrySku,
  stripUngroundedSkusFromText,
  stripFabricatedSkusFromText,
  stripUngroundedSkusFromLines,
  stripFabricatedSkusFromLines,
  normalizeSkuCandidate,
  toSkuSet,
};
