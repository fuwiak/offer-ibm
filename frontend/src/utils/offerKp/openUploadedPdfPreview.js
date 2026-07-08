import { AUTH_TOKEN, fullApiUrl } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/** Revoke prior blob URL before assigning a new uploaded PDF preview. */
export function revokeUploadedPdfBlob(url) {
  if (url && String(url).startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export function uploadedPdfOriginalUrl(workspaceSlug, fileId, threadSlug = null) {
  const basePath = new URL(
    `${fullApiUrl()}/workspace/${workspaceSlug}/parsed-files/${fileId}/original`
  );
  if (threadSlug) basePath.searchParams.set("threadSlug", threadSlug);
  return basePath.toString();
}

export async function downloadUploadedPdfBlob({
  workspaceSlug,
  fileId,
  threadSlug = null,
}) {
  const url = uploadedPdfOriginalUrl(workspaceSlug, fileId, threadSlug);
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
 * Load uploaded source PDF into the comparison sidebar (blob URL + PDF.js).
 */
export async function openUploadedPdfPreview({
  workspaceSlug,
  threadSlug = null,
  file,
  setUploadedPdfPreview,
  setUploadedPdfSidebarOpen,
  previousUrl = null,
}) {
  if (!file?.id || !workspaceSlug) throw new Error("Missing file or workspace");
  const blob = await downloadUploadedPdfBlob({
    workspaceSlug,
    fileId: file.id,
    threadSlug,
  });
  revokeUploadedPdfBlob(previousUrl);
  const url = URL.createObjectURL(blob);
  setUploadedPdfPreview({
    mode: "pdf",
    url,
    filename: file.title || file.filename || "uploaded.pdf",
    fileId: file.id,
  });
  setUploadedPdfSidebarOpen(true);
}

/**
 * Open PDF preview with fallback to parsed text when the original file is missing.
 */
export async function openUploadedFilePreview({
  workspaceSlug,
  threadSlug = null,
  file,
  setUploadedPdfPreview,
  setUploadedPdfSidebarOpen,
  previousUrl = null,
  fetchTextPreview = null,
}) {
  if (!file?.id || !workspaceSlug) throw new Error("Missing file or workspace");

  if (file.hasOriginalPdf) {
    try {
      await openUploadedPdfPreview({
        workspaceSlug,
        threadSlug,
        file,
        setUploadedPdfPreview,
        setUploadedPdfSidebarOpen,
        previousUrl,
      });
      return;
    } catch {
      // fall through to parsed text
    }
  }

  if (!fetchTextPreview) {
    throw new Error("Original PDF is not available for this file.");
  }

  const preview = await fetchTextPreview();
  if (!preview?.textPreview) {
    throw new Error("Original PDF is not available for this file.");
  }

  revokeUploadedPdfBlob(previousUrl);
  setUploadedPdfPreview({
    mode: "text",
    filename: file.title || file.filename || "uploaded.pdf",
    fileId: file.id,
    textPreview: preview.textPreview,
    totalLines: preview.totalLines || 0,
  });
  setUploadedPdfSidebarOpen(true);
}
