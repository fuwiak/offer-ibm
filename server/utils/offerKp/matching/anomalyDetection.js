"use strict";

/**
 * Lightweight anomaly / OOD detection for inquiry lines.
 * Flags weird inputs (Bobik testing the system) before auto-match.
 */

const { parseHardwareQuery } = require("../hardwareQuery");
const { extractStandardNumbers } = require("../analogRules");
const { getStandardMeta, listGraphNodes } = require("./standardGraph");

const KNOWN_DIAMETERS = new Set(
  [
    3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 42, 45,
    48, 52, 56, 60,
  ].map(String)
);

/**
 * @param {string} queryText
 * @param {{candidates?: object[], embeddingTop?: number|null}} [ctx]
 */
function detectAnomaly(queryText, ctx = {}) {
  const text = String(queryText || "").trim();
  const reasons = [];
  const parsed = parseHardwareQuery(text);

  if (text.length > 280) reasons.push("line_too_long");
  if (text.length > 0 && text.length < 3) reasons.push("line_too_short");

  // Random keyboard / nonsense density.
  const letters = (text.match(/\p{L}/gu) || []).length;
  const digits = (text.match(/\p{N}/gu) || []).length;
  const other =
    text.length - letters - digits - (text.match(/\s/g) || []).length;
  if (text.length >= 12 && other / text.length > 0.45) {
    reasons.push("high_noise_chars");
  }

  const standards = extractStandardNumbers(text);
  for (const s of standards) {
    if (!getStandardMeta(s) && !listGraphNodes().includes(String(s))) {
      // Unknown standard number — not necessarily bad (catalog may have it),
      // but combined with no type/size → OOD-ish.
      if (
        !(parsed.productTypes || []).length &&
        !parsed.thread &&
        !parsed.diameter
      ) {
        reasons.push("unknown_standard");
      }
    }
  }

  const diameter = parsed.thread?.size || parsed.diameter;
  if (diameter && !KNOWN_DIAMETERS.has(String(diameter))) {
    // Only flag truly exotic sizes; large washers/nuts (M39–M60) are normal.
    const n = Number(diameter);
    if (!Number.isFinite(n) || n < 2 || n > 100) {
      reasons.push("unusual_diameter");
    }
  }

  // Bizarre dimension combo (e.g. M3x500).
  if (parsed.thread) {
    const d = Number(parsed.thread.size);
    const l = Number(parsed.thread.length);
    if (Number.isFinite(d) && Number.isFinite(l) && l > d * 40) {
      reasons.push("unusual_dimension_ratio");
    }
  }

  const langShift =
    /\p{Script=Latin}/u.test(text) &&
    /\p{Script=Cyrillic}/u.test(text) &&
    (text.match(/\p{Script=Latin}/gu) || []).length > 20 &&
    (text.match(/\p{Script=Cyrillic}/gu) || []).length > 20;
  if (langShift) reasons.push("mixed_script_noise");

  // Only use embedding distance when at least one candidate actually has an
  // embedding score. Structured SQL hits often have none — treating missing
  // scores as 0 falsely marked every catalog match as OOD and zeroed prices.
  const embeddingScores = (ctx.candidates || [])
    .map((p) => Number(p._embeddingSimilarity))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (embeddingScores.length > 0) {
    const embTop = Math.max(...embeddingScores);
    if (embTop < 0.25) reasons.push("embedding_far_from_catalog");
  } else if (
    Number.isFinite(ctx.embeddingTop) &&
    ctx.embeddingTop > 0 &&
    ctx.embeddingTop < 0.25 &&
    (ctx.candidates || []).length > 0
  ) {
    reasons.push("embedding_far_from_catalog");
  }

  // Gibberish repeated chars
  if (/(.)\1{6,}/.test(text)) reasons.push("repeated_char_spam");

  const outOfDistribution = reasons.length > 0;
  return {
    outOfDistribution,
    reasons,
    allowAutomaticMatch: !outOfDistribution,
    reason: reasons[0] || null,
  };
}

module.exports = { detectAnomaly, KNOWN_DIAMETERS };
