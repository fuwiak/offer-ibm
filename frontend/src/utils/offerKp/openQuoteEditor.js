import {
  parseQuoteMarkdown,
  parseQuoteReferenceFromMarkdown,
} from "@/utils/offerKp/parseQuoteMarkdown";
import { buildQuoteMarkdown } from "@/utils/offerKp/buildQuoteMarkdown";

function normalizeEditableLines(rawLines = []) {
  return rawLines.map((l) => ({
    name: l.name || l.productName || "",
    article: l.article || l.sku || "",
    quantity: Number(l.quantity) || 1,
    unit: l.unit || "шт",
    priceWithVat: Number(l.priceWithVat ?? l.unitPrice ?? 0),
    lineTotal:
      Number(l.lineTotal) ||
      Number(
        (
          (Number(l.quantity) || 1) *
          Number(l.priceWithVat ?? l.unitPrice ?? 0)
        ).toFixed(2)
      ),
    weightKg: Number(l.weightKg) || 0,
    status: l.status || "Требует проверки",
    comment: l.comment || "",
    analogOf: l.analogOf || null,
    alternatives: l.alternatives || [],
    inquiryRaw: l.inquiryRaw || l.requestedName || "",
  }));
}

function computeTotals(lines) {
  const subtotal = lines.reduce(
    (s, l) => s + (Number(l.lineTotal) || 0),
    0
  );
  const totalWeightKg = lines.reduce(
    (s, l) => s + (Number(l.weightKg) || 0) * (Number(l.quantity) || 1),
    0
  );
  return { subtotal, totalWeightKg, total: subtotal };
}

/**
 * Open the manual correction table from generated markdown or structured lines.
 */
export function openQuoteEditor({
  markdown = "",
  lines = null,
  reference = null,
  customer = null,
  filename = "",
  setQuoteDraft,
  setDocumentPanelView,
  setDocumentPanelOpen,
  setDocPreview,
}) {
  const fromMarkdown = parseQuoteMarkdown(markdown);
  const parsed =
    fromMarkdown.length > 0
      ? fromMarkdown
      : lines?.length > 0
        ? normalizeEditableLines(lines)
        : [];

  if (!parsed.length) {
    throw new Error("No line items found in document");
  }

  const ref =
    reference ||
    parseQuoteReferenceFromMarkdown(markdown) ||
    `EDIT-${Date.now().toString(36).toUpperCase()}`;

  const totals = computeTotals(parsed);
  const previewMarkdown = buildQuoteMarkdown({
    reference: ref,
    customer: customer || {},
    lines: parsed,
    subtotal: totals.subtotal,
    total: totals.total,
  });

  setQuoteDraft((prev) => ({
    ...prev,
    reference: ref,
    customer: customer || prev.customer || {},
    hardwareLines: parsed,
    sourceFilename: filename || prev.sourceFilename || "",
    preview: {
      ...(prev.preview || {}),
      lines: parsed,
      subtotal: totals.subtotal,
      total: totals.total,
      totalWeightKg: totals.totalWeightKg,
    },
  }));

  if (setDocPreview) {
    setDocPreview({
      filename: filename || `KP-${ref}.docx`,
      markdown: previewMarkdown,
    });
  }

  setDocumentPanelView("draftTable");
  setDocumentPanelOpen(true);
}
