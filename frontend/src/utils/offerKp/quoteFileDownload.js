import { API_BASE, AUTH_TOKEN } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";
import OfferKp from "@/models/offerKp";

/** Resolve download URL for auto-generated quote / agent files. */
export function quoteFileDownloadUrl(storageFilename, displayFilename = "") {
  const name = displayFilename || storageFilename || "";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return OfferKp.quotePdfDownloadUrl(storageFilename);
  if (ext === "docx" || ext === "doc") {
    return OfferKp.quoteDocxDownloadUrl(storageFilename);
  }
  if (ext === "xlsx" || ext === "xls") {
    return OfferKp.quoteXlsxDownloadUrl(storageFilename);
  }
  return `${API_BASE}/agent-skills/generated-files/${encodeURIComponent(storageFilename)}`;
}

export async function downloadQuoteFileBlob({ storageFilename, filename }) {
  const url = quoteFileDownloadUrl(storageFilename, filename);
  const token = window.localStorage.getItem(AUTH_TOKEN) || "";
  const headers = {
    ...baseHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      detail.slice(0, 120) || `Download failed (${res.status})`
    );
  }
  return res.blob();
}

/**
 * Download DOCX matching the side-panel preview.
 * Prefers structured quote draft (same layout as PDF / Превью КП).
 */
export async function downloadDocxMatchingPreview({
  filename,
  storageFilename,
  previewMarkdown,
  quoteDraft = null,
}) {
  const lines =
    quoteDraft?.hardwareLines || quoteDraft?.preview?.lines || null;
  if (lines?.length) {
    const shipping =
      Number(quoteDraft.shipping ?? quoteDraft.preview?.shipping ?? 0) || 0;
    const subtotal =
      Number(quoteDraft.preview?.subtotal) ||
      lines.reduce((s, l) => s + (Number(l.lineTotal) || 0), 0);
    const result = await OfferKp.generateQuoteDocx({
      reference: quoteDraft.reference,
      customer: quoteDraft.customer || {},
      lines,
      shipping,
      subtotal,
      total: subtotal,
      vatRate: quoteDraft.doc?.vatRate,
      currency: undefined,
      doc: quoteDraft.doc,
      createdAt: quoteDraft.doc?.createdAt
        ? new Date(quoteDraft.doc.createdAt)
        : new Date(),
    });
    const blob = await downloadQuoteFileBlob({
      storageFilename: result.storageFilename,
      filename: result.filename,
    });
    return { blob, filename: result.filename || filename || "document.docx" };
  }

  if (previewMarkdown?.trim()) {
    const result = await OfferKp.generateDocxFromMarkdown({
      markdown: previewMarkdown,
      filename: filename || "document.docx",
    });
    const blob = await downloadQuoteFileBlob({
      storageFilename: result.storageFilename,
      filename: result.filename,
    });
    return { blob, filename: result.filename || filename || "document.docx" };
  }

  if (!storageFilename) {
    throw new Error("No file to download");
  }

  const blob = await downloadQuoteFileBlob({ storageFilename, filename });
  return { blob, filename: filename || storageFilename };
}

/** PDF as-is; DOCX from preview markdown when available. */
export async function downloadFileMatchingPreview({
  filename,
  storageFilename,
  previewMarkdown,
}) {
  const name = filename || storageFilename || "";
  if (/\.pdf$/i.test(name)) {
    const blob = await downloadQuoteFileBlob({ storageFilename, filename });
    return { blob, filename: name };
  }
  return downloadDocxMatchingPreview({
    filename,
    storageFilename,
    previewMarkdown,
  });
}

/** Collect generated KP files from loaded chat history. */
export function extractQuoteFilesFromHistory(history = []) {
  const byStorage = new Map();
  for (const msg of history) {
    if (Array.isArray(msg.outputs)) {
      for (const output of msg.outputs) {
        const payload = output?.payload;
        if (!payload?.storageFilename) continue;
        byStorage.set(payload.storageFilename, {
          ...payload,
          kind: /\.pdf$/i.test(payload.filename || "")
            ? "pdf"
            : /\.docx?$/i.test(payload.filename || "")
              ? "docx"
              : "file",
        });
      }
    }
    if (msg.type === "fileDownloadCard" && msg.content?.storageFilename) {
      const payload = msg.content;
      byStorage.set(payload.storageFilename, {
        ...payload,
        kind: /\.pdf$/i.test(payload.filename || "") ? "pdf" : "docx",
      });
    }
  }
  return Array.from(byStorage.values());
}

export function mergeQuoteFiles(existing = [], incoming = []) {
  const byStorage = new Map();
  for (const file of existing) {
    if (file?.storageFilename) byStorage.set(file.storageFilename, file);
  }
  for (const file of incoming) {
    if (file?.storageFilename) byStorage.set(file.storageFilename, file);
  }
  return Array.from(byStorage.values());
}
