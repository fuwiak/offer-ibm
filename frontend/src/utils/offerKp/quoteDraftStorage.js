import { safeJsonParse } from "@/utils/request";
import { INITIAL_QUOTE_DRAFT } from "@/utils/offerKp/quoteFlow";

// v2 uses the canonical net contract for lineTotal/subtotal. Do not hydrate
// pre-v2 drafts whose totals may already include VAT.
const PREFIX = "offerKp:quote-draft:v2:";

/** Soft cap for a single persisted draft JSON string (~localStorage is ~5MB). */
const MAX_DRAFT_CHARS = 1_500_000;

function storageKey(workspaceSlug, threadSlug) {
  return `${PREFIX}${workspaceSlug}:${threadSlug || "default"}`;
}

function hasEditableLines(draft) {
  return (
    (draft?.hardwareLines?.length ?? 0) > 0 ||
    (draft?.preview?.lines?.length ?? 0) > 0
  );
}

function isQuotaExceeded(err) {
  if (!err) return false;
  if (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return true;
  }
  const msg = String(err.message || err);
  return /quota|exceeded the quota|QUOTA_EXCEEDED/i.test(msg);
}

/**
 * Core line fields needed to restore the сводка / preview UI.
 * Drops Top-N alternatives, match candidates, evidence, enrichment blobs —
 * those routinely push a ~10-line draft over the ~5MB localStorage quota.
 */
export function stripLineForStorage(line = {}) {
  if (!line || typeof line !== "object") return line;
  const custom =
    line.custom && typeof line.custom === "object" && !Array.isArray(line.custom)
      ? line.custom
      : undefined;
  const thread =
    line.thread && typeof line.thread === "object" ? line.thread : undefined;
  return {
    inquiryRaw: line.inquiryRaw,
    name: line.name,
    requestedName: line.requestedName,
    productName: line.productName,
    productNameRu: line.productNameRu,
    article: line.article || line.sku,
    sku: line.sku || line.article,
    productId: line.productId,
    productUrl: line.productUrl,
    quantity: line.quantity,
    unit: line.unit,
    unitPriceNet: line.unitPriceNet,
    priceWithVat: line.priceWithVat,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    weightKg: line.weightKg,
    lineWeightKg: line.lineWeightKg,
    status: line.status,
    kpStatus: line.kpStatus,
    matchType: line.matchType,
    allowPrice: line.allowPrice,
    operatorPriceOverride: line.operatorPriceOverride,
    analogOf: line.analogOf,
    comment: line.comment,
    unitNeedsRecalc: line.unitNeedsRecalc,
    stockCount: line.stockCount,
    lengthMm: line.lengthMm,
    heightMm: line.heightMm,
    spec: line.spec,
    matchSource: line.matchSource,
    mismatchReason: line.mismatchReason,
    reviewReason: line.reviewReason,
    priceSource: line.priceSource,
    priceSnapshot: line.priceSnapshot,
    thread,
    custom,
    // Explicit empty — UI treats missing vs [] the same for the alt dropdown.
    alternatives: [],
  };
}

function slimPreviewForStorage(preview, lines) {
  if (!preview || typeof preview !== "object") {
    return lines?.length
      ? {
          lines,
          subtotal: 0,
          total: 0,
          totalWeightKg: 0,
        }
      : null;
  }
  return {
    lines,
    subtotal: preview.subtotal,
    total: preview.total,
    totalWeightKg: preview.totalWeightKg,
    vatRate: preview.vatRate,
    shipping: preview.shipping,
  };
}

function slimDocForStorage(doc) {
  if (!doc || typeof doc !== "object") return doc;
  return {
    createdAt: doc.createdAt,
    vatRate: doc.vatRate,
    currency: doc.currency,
    title: doc.title,
    validityDays: doc.validityDays,
    paymentTerms: doc.paymentTerms,
    deliveryTerms: doc.deliveryTerms,
  };
}

/**
 * Persistable quote draft: restore UI, no match-engine ballast.
 * @param {object} draft
 * @param {{ omitPreviewLines?: boolean }} [opts]
 */
export function stripDraftForStorage(draft, opts = {}) {
  if (!draft || typeof draft !== "object") return null;
  const sourceLines = draft.hardwareLines || draft.preview?.lines || [];
  if (!Array.isArray(sourceLines) || !sourceLines.length) return null;

  const hardwareLines = sourceLines.map(stripLineForStorage);
  const previewLines = opts.omitPreviewLines ? undefined : hardwareLines;

  return {
    reference: draft.reference,
    customer: draft.customer || { name: "", country: "" },
    priceMode: draft.priceMode || "public",
    hardwareLines,
    preview: slimPreviewForStorage(draft.preview, previewLines),
    shipping: draft.shipping ?? 0,
    sourceFilename: draft.sourceFilename,
    doc: slimDocForStorage(draft.doc),
    customColumns: Array.isArray(draft.customColumns)
      ? draft.customColumns
      : undefined,
    step: draft.step,
    updatedAt: Date.now(),
  };
}

/** List offerKp quote-draft keys with parsed updatedAt (oldest first). */
export function listQuoteDraftKeys() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      let updatedAt = 0;
      try {
        const raw = localStorage.getItem(key);
        const parsed = safeJsonParse(raw, null);
        updatedAt = Number(parsed?.updatedAt) || 0;
      } catch {
        updatedAt = 0;
      }
      keys.push({ key, updatedAt });
    }
  } catch {
    return [];
  }
  keys.sort((a, b) => a.updatedAt - b.updatedAt);
  return keys;
}

/**
 * Drop oldest drafts (optionally keep `keepKey`) until `removeCount` removed
 * or no more foreign keys left.
 */
export function pruneOldestQuoteDrafts(keepKey, removeCount = 3) {
  const entries = listQuoteDraftKeys().filter((e) => e.key !== keepKey);
  let removed = 0;
  for (const entry of entries) {
    if (removed >= removeCount) break;
    try {
      localStorage.removeItem(entry.key);
      removed += 1;
    } catch {
      // ignore
    }
  }
  return removed;
}

/**
 * Try setItem; on quota prune old thread drafts and retry with slimmer payload.
 * Never throws — quota must not crash the React tree.
 */
export function saveQuoteDraft(workspaceSlug, threadSlug, draft) {
  if (!workspaceSlug || !hasEditableLines(draft)) return { ok: false, reason: "empty" };
  const key = storageKey(workspaceSlug, threadSlug);

  const primary = stripDraftForStorage(draft);
  if (!primary) return { ok: false, reason: "empty" };

  const attempts = [
    primary,
    // Drop duplicate preview.lines (hardwareLines alone restores UI).
    stripDraftForStorage(draft, { omitPreviewLines: true }),
  ];

  for (let i = 0; i < attempts.length; i += 1) {
    const payload = attempts[i];
    if (!payload) continue;
    let json;
    try {
      json = JSON.stringify(payload);
    } catch {
      continue;
    }
    if (json.length > MAX_DRAFT_CHARS && i < attempts.length - 1) continue;

    try {
      localStorage.setItem(key, json);
      return { ok: true, bytes: json.length, attempt: i };
    } catch (err) {
      if (!isQuotaExceeded(err)) {
        console.warn("[offerKp] quote draft save failed:", err);
        return { ok: false, reason: "error", error: err };
      }
      pruneOldestQuoteDrafts(key, 5);
      try {
        localStorage.setItem(key, json);
        return { ok: true, bytes: json.length, attempt: i, pruned: true };
      } catch (retryErr) {
        if (!isQuotaExceeded(retryErr)) {
          console.warn("[offerKp] quote draft save retry failed:", retryErr);
          return { ok: false, reason: "error", error: retryErr };
        }
        // Fall through to next (slimmer) attempt.
      }
    }
  }

  // Last resort: clear this key and skip persist — in-memory draft still works.
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
  console.warn(
    "[offerKp] quote draft skipped: localStorage quota exceeded after prune"
  );
  return { ok: false, reason: "quota" };
}

export function loadQuoteDraft(workspaceSlug, threadSlug) {
  if (!workspaceSlug) return { ...INITIAL_QUOTE_DRAFT };
  try {
    const stored = safeJsonParse(
      localStorage.getItem(storageKey(workspaceSlug, threadSlug)),
      null
    );
    if (!stored || !hasEditableLines(stored)) return { ...INITIAL_QUOTE_DRAFT };
    return { ...INITIAL_QUOTE_DRAFT, ...stored };
  } catch (err) {
    console.warn("[offerKp] quote draft load failed:", err);
    return { ...INITIAL_QUOTE_DRAFT };
  }
}

/** Drop persisted draft so «Run again» / edit-first-message rematch from scratch. */
export function clearQuoteDraft(workspaceSlug, threadSlug) {
  if (!workspaceSlug) return;
  try {
    localStorage.removeItem(storageKey(workspaceSlug, threadSlug));
  } catch {
    // ignore
  }
}
