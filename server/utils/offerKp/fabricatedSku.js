"use strict";

/**
 * Detect LLM / placeholder SKUs that must never appear in chat, draft, or export.
 * Real ShopDB артикулы are varied digit strings (e.g. 069280140063050) — not
 * "1" + a wall of zeros or a run of the same digit.
 */

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
 * Drop "Артикул / SKU: …" / bullet SKU lines when the value is fabricated.
 * @param {string} text
 * @returns {string}
 */
function stripFabricatedSkusFromText(text = "") {
  let t = String(text || "");
  t = t.replace(
    /^[^\n]*(?:Артикул\s*(?:\/\s*SKU)?|\*{0,2}Артикул\*{0,2}\s*(?:\/\s*\*{0,2}SKU\*{0,2})?|SKU)\s*:\s*([^\s\n*|]+)[^\n]*$/gim,
    (line, sku) => (isFabricatedSku(sku) ? "" : line)
  );
  t = t.replace(/^\s*·\s*([A-Za-z0-9._/-]+)\s*$/gm, (line, sku) =>
    isFabricatedSku(sku) ? "" : line
  );
  // Inline "SKU: 1000…" remnants inside a longer line
  t = t.replace(
    /((?:Артикул\s*(?:\/\s*SKU)?|SKU)\s*:\s*)([^\s\n*|]+)/gi,
    (full, label, sku) => (isFabricatedSku(sku) ? "" : full)
  );
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Clear fabricated article/sku fields on draft/quote lines.
 * @param {object[]} lines
 * @returns {object[]}
 */
function stripFabricatedSkusFromLines(lines = []) {
  return (lines || []).map((line) => {
    if (!line || typeof line !== "object") return line;
    const next = { ...line };
    if (isFabricatedSku(next.article)) next.article = "";
    if (isFabricatedSku(next.sku)) next.sku = "";
    return next;
  });
}

module.exports = {
  isFabricatedSku,
  sanitizeSku,
  stripFabricatedSkusFromText,
  stripFabricatedSkusFromLines,
  normalizeSkuCandidate,
};
