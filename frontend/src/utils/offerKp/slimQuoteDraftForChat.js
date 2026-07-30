/**
 * Slim quote draft before POST /stream-chat.
 * Full hardwareLines include Top-N alternatives with URLs/features and often
 * duplicate preview.lines — that can be ~1MB+ and abort SSE as "network error".
 */

const ALT_KEEP = 15;

function slimAlternative(alt = {}) {
  if (!alt || typeof alt !== "object") return null;
  return {
    productId: alt.productId || undefined,
    name: alt.name || "",
    sku: alt.sku || alt.article || "",
    price: alt.price ?? alt.unitPriceNet ?? 0,
    stockCount: alt.stockCount ?? 0,
    matchType: alt.matchType || undefined,
    status: alt.status || undefined,
    analogOf: alt.analogOf || undefined,
  };
}

function slimDraftLine(line = {}) {
  if (!line || typeof line !== "object") return line;
  const alternatives = Array.isArray(line.alternatives)
    ? line.alternatives
        .slice(0, ALT_KEEP)
        .map(slimAlternative)
        .filter(Boolean)
    : [];
  return {
    name: line.name,
    requestedName: line.requestedName || line.inquiryRaw,
    inquiryRaw: line.inquiryRaw,
    productName: line.productName,
    article: line.article || line.sku,
    sku: line.sku || line.article,
    productId: line.productId,
    quantity: line.quantity,
    unit: line.unit,
    unitPriceNet: line.unitPriceNet,
    priceWithVat: line.priceWithVat,
    lineTotal: line.lineTotal,
    weightKg: line.weightKg,
    status: line.status,
    kpStatus: line.kpStatus,
    matchType: line.matchType,
    allowPrice: line.allowPrice,
    operatorPriceOverride: line.operatorPriceOverride,
    comment: line.comment,
    analogOf: line.analogOf,
    alternatives,
  };
}

/**
 * True when the user pasted a multi-line RFQ — do not attach prior draft
 * (create_quote rematch must not drag megabytes of old alternatives).
 */
export function isLikelyMultiLineRfq(message = "") {
  const lines = String(message || "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  const hardwareish = lines.filter((l) =>
    /болт|гайк|шайб|винт|шпильк|din\s*\d|гост\s*\d|м\s*\d+|m\s*\d+/i.test(l)
  );
  return hardwareish.length >= 2;
}

export function slimQuoteDraftForChat(draft) {
  if (!draft || typeof draft !== "object") return null;
  const lines = draft.hardwareLines || draft.preview?.lines || [];
  if (!Array.isArray(lines) || !lines.length) return null;
  const hardwareLines = lines.map(slimDraftLine);
  return {
    reference: draft.reference,
    customer: draft.customer || {},
    vatRate: draft.vatRate,
    step: draft.step,
    hardwareLines,
    // Do not duplicate full lines under preview — totals only.
    preview: {
      subtotal: draft.preview?.subtotal,
      total: draft.preview?.total,
      totalWeightKg: draft.preview?.totalWeightKg,
      vatRate: draft.preview?.vatRate,
    },
  };
}

/**
 * @param {object|null} draft
 * @param {string} message
 * @returns {object|null}
 */
export function quoteDraftPayloadForChat(draft, message = "") {
  if (!draft) return null;
  if (isLikelyMultiLineRfq(message)) return null;
  return slimQuoteDraftForChat(draft);
}

export default slimQuoteDraftForChat;
