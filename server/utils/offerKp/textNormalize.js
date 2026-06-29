"use strict";

/**
 * Нормализация для сопоставления кириллица/латиница/OCR без тяжёлого NLP.
 */

const CYRILLIC_TO_LATIN = {
  а: "a",
  в: "b",
  е: "e",
  ё: "e",
  и: "i",
  к: "k",
  м: "m",
  н: "n",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
  ц: "c",
  з: "z",
};

function foldHomoglyphs(text) {
  let out = String(text || "").toLowerCase().replace(/ё/g, "е");
  out = [...out].map((ch) => CYRILLIC_TO_LATIN[ch] || ch).join("");
  return out;
}

function normalizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/×/g, "x")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function expandThreadVariants(term) {
  const variants = [];
  const m = String(term || "").match(/m\s*(\d+)\s*x\s*(\d+)/i);
  if (!m) return variants;
  const size = m[1];
  const length = m[2];
  variants.push(
    `m${size}x${length}`,
    `m ${size}x${length}`,
    `m ${size} x ${length}`,
    `m${size} x ${length}`
  );
  return variants;
}

function expandSearchTermVariants(term) {
  const base = String(term || "").trim();
  if (!base || base.length < 2) return [];

  const variants = new Set();
  const lower = base.toLowerCase();
  variants.add(lower);

  const folded = foldHomoglyphs(lower);
  variants.add(folded);

  const compact = lower.replace(/\s+/g, "");
  if (compact) variants.add(compact);

  for (const threadVariant of expandThreadVariants(lower)) {
    variants.add(threadVariant);
    variants.add(foldHomoglyphs(threadVariant));
  }

  return [...variants].filter(Boolean);
}

function expandSearchTerms(terms, maxTerms = 20) {
  const seen = new Set();
  const out = [];

  for (const term of terms || []) {
    for (const variant of expandSearchTermVariants(term)) {
      const key = variant.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(variant);
      if (out.length >= maxTerms) return out;
    }
  }

  return out;
}

module.exports = {
  foldHomoglyphs,
  normalizeSearchText,
  expandSearchTermVariants,
  expandSearchTerms,
};
