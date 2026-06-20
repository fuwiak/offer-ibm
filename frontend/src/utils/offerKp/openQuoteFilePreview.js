import { downloadQuoteFileBlob } from "@/utils/offerKp/quoteFileDownload";

/** Revoke prior blob URL before assigning a new PDF preview. */
export function revokeBlobUrl(url) {
  if (url && String(url).startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Open PDF in the right panel (blob URL + iframe), matching elia_front.
 */
export function openPdfPreviewFromBlob({
  blob,
  filename,
  setQuotePdfUrl,
  setDocumentPanelOpen,
  setDocumentPanelView,
  previousPdfUrl = null,
  xlsUrl = null,
  xlsFilename = null,
}) {
  if (!blob) throw new Error("No blob");
  revokeBlobUrl(previousPdfUrl);
  const url = URL.createObjectURL(blob);
  setQuotePdfUrl({
    url,
    filename: filename || "document.pdf",
    ...(xlsUrl ? { xlsUrl, xlsFilename } : {}),
  });
  setDocumentPanelOpen(true);
  setDocumentPanelView("pdf");
}

/**
 * Preview a stored generated file (PDF or markdown DOC) from chat / panel.
 */
export async function openStoredFilePreview({
  filename,
  storageFilename,
  previewMarkdown,
  setQuotePdfUrl,
  setDocumentPanelOpen,
  setDocumentPanelView,
  setDocPreview,
  previousPdfUrl = null,
}) {
  const displayName = filename || storageFilename || "";
  const isPdf = /\.pdf$/i.test(displayName);

  if (!isPdf && previewMarkdown) {
    setDocPreview({
      filename: displayName,
      storageFilename,
      markdown: previewMarkdown,
    });
    setDocumentPanelOpen(true);
    setDocumentPanelView("doc");
    return;
  }

  if (!storageFilename) throw new Error("Missing storage filename");

  const blob = await downloadQuoteFileBlob({
    storageFilename,
    filename: displayName,
  });

  if (isPdf) {
    openPdfPreviewFromBlob({
      blob,
      filename: displayName,
      setQuotePdfUrl,
      setDocumentPanelOpen,
      setDocumentPanelView,
      previousPdfUrl,
    });
    return;
  }

  if (/\.docx?$/i.test(displayName)) {
    setDocPreview({
      filename: displayName,
      storageFilename,
      markdown: previewMarkdown || null,
    });
    setDocumentPanelOpen(true);
    setDocumentPanelView("doc");
  }
}
