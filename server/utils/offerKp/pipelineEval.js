"use strict";

/**
 * Offline evaluation harness for quote / match pipeline stability.
 * Compares business fields across repeated runs — cosmetic text diffs ignored.
 */

const crypto = require("crypto");

/**
 * Stable business fingerprint of a matched line (excludes comments/formatting).
 * @param {object} line
 */
function lineBusinessFingerprint(line = {}) {
  return {
    requested: String(line.requestedName || line.inquiryRaw || "").trim(),
    productId: line.productId ? String(line.productId) : null,
    sku: line.article || line.sku || null,
    matchType: String(line.matchType || "none"),
    unitPriceNet: roundMoney(line.unitPriceNet ?? line.unitPrice),
    quantity: Number(line.quantity) || 1,
    allowPrice: Boolean(line.allowPrice),
  };
}

function roundMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100) / 100;
}

/**
 * @param {object} draft
 */
function draftBusinessFingerprint(draft = {}) {
  const lines = (draft.lines || []).map(lineBusinessFingerprint);
  return {
    lineCount: lines.length,
    lines,
    subtotal: roundMoney(draft.subtotal),
  };
}

function hashFingerprint(fp) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(fp))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Compare two draft fingerprints — business-only.
 * @returns {{ same: boolean, diffs: object[] }}
 */
function compareDraftFingerprints(a, b) {
  const diffs = [];
  if (a.lineCount !== b.lineCount) {
    diffs.push({
      field: "lineCount",
      left: a.lineCount,
      right: b.lineCount,
    });
  }
  const n = Math.max(a.lines.length, b.lines.length);
  for (let i = 0; i < n; i++) {
    const L = a.lines[i];
    const R = b.lines[i];
    if (!L || !R) {
      diffs.push({ field: `line[${i}]`, left: L || null, right: R || null });
      continue;
    }
    for (const key of [
      "productId",
      "sku",
      "matchType",
      "unitPriceNet",
      "quantity",
      "allowPrice",
    ]) {
      if (L[key] !== R[key]) {
        diffs.push({
          field: `line[${i}].${key}`,
          left: L[key],
          right: R[key],
        });
      }
    }
  }
  if (a.subtotal !== b.subtotal) {
    diffs.push({ field: "subtotal", left: a.subtotal, right: b.subtotal });
  }
  return { same: diffs.length === 0, diffs };
}

/**
 * Detect forbidden SKUs / invented priced SKUs in a draft.
 * @param {object} draft
 * @param {string[]} [forbiddenSkus]
 */
function findForbiddenSkuHits(draft = {}, forbiddenSkus = []) {
  const banned = new Set(
    (forbiddenSkus || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean)
  );
  const hits = [];
  for (const line of draft.lines || []) {
    const sku = String(line.article || line.sku || "").toLowerCase();
    if (sku && banned.has(sku)) {
      hits.push({ sku, productId: line.productId, matchType: line.matchType });
    }
    const price = Number(line.unitPriceNet) || 0;
    if (price > 0 && !["exact", "analog"].includes(String(line.matchType))) {
      hits.push({
        sku: sku || null,
        reason: "priced_non_eligible_match",
        matchType: line.matchType,
      });
    }
  }
  return hits;
}

/**
 * Run matcher N times and measure deterministic replay rate.
 * @param {() => Promise<object>} runOnce — returns draft
 * @param {{ repeats?: number, forbiddenSkus?: string[] }} [opts]
 */
async function evaluatePipelineStability(runOnce, opts = {}) {
  const repeats = Math.max(2, Math.min(50, opts.repeats ?? 5));
  const fingerprints = [];
  const drafts = [];
  for (let i = 0; i < repeats; i++) {
    const draft = await runOnce();
    drafts.push(draft);
    fingerprints.push(draftBusinessFingerprint(draft));
  }

  const baseline = fingerprints[0];
  const baselineHash = hashFingerprint(baseline);
  let sameAsBaseline = 0;
  const allDiffs = [];
  for (let i = 0; i < fingerprints.length; i++) {
    const cmp = compareDraftFingerprints(baseline, fingerprints[i]);
    if (cmp.same) sameAsBaseline += 1;
    else allDiffs.push({ run: i, diffs: cmp.diffs });
  }

  const abstentions = drafts.map(
    (d) =>
      (d.lines || []).filter(
        (l) =>
          !l.productId ||
          String(l.matchType) === "none" ||
          !(Number(l.unitPriceNet) > 0)
      ).length
  );
  const forbidden = drafts.flatMap((d) =>
    findForbiddenSkuHits(d, opts.forbiddenSkus)
  );

  return {
    repeats,
    baselineHash,
    deterministicReplayRate: sameAsBaseline / repeats,
    divergentRuns: allDiffs,
    lineCount: baseline.lineCount,
    abstentionLineCounts: abstentions,
    forbiddenHits: forbidden,
    ok:
      sameAsBaseline === repeats &&
      forbidden.length === 0 &&
      baseline.lineCount > 0,
  };
}

module.exports = {
  lineBusinessFingerprint,
  draftBusinessFingerprint,
  hashFingerprint,
  compareDraftFingerprints,
  findForbiddenSkuHits,
  evaluatePipelineStability,
};
