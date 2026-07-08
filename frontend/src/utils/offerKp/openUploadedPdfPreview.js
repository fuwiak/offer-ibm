import { API_BASE, AUTH_TOKEN, fullApiUrl } from "@/utils/constants";
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
 * Open uploaded source PDF in the comparison sidebar (blob URL + iframe).
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
    url,
    filename: file.title || file.filename || "uploaded.pdf",
    fileId: file.id,
  });
  setUploadedPdfSidebarOpen(true);
}
