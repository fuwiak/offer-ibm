import { memo, useState, useCallback, useEffect, useRef } from "react";
import { saveAs } from "file-saver";
import { DownloadSimple, CircleNotch, Eye } from "@phosphor-icons/react";
import { humanFileSize } from "@/utils/numbers";
import StorageFiles from "@/models/files";
import { useOfferKp } from "@/contexts/OfferKpContext";

/** Google-Drive-style document card that matches the image mockup */
function FileDownloadCard({ props }) {
  const { filename, storageFilename, fileSize, previewMarkdown } =
    props.content || {};
  const isPdf = /\.pdf$/i.test(filename || "");
  const canPreviewDoc = !isPdf && !!previewMarkdown;
  const { badge, badgeBg, badgeText, fileType } = getFileDisplayInfo(filename);
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const {
    enabled: offerKpEnabled,
    setQuotePdfUrl,
    setDocumentPanelView,
    setDocumentPanelOpen,
    setDocPreview,
  } = useOfferKp();
  const autoPreviewedRef = useRef(null);

  // Auto-open right panel doc preview (like Avelia UX after create-docx-file).
  useEffect(() => {
    if (!offerKpEnabled || !canPreviewDoc || !previewMarkdown) return;
    const key = storageFilename || filename;
    if (!key || autoPreviewedRef.current === key) return;
    autoPreviewedRef.current = key;
    setDocPreview({
      filename: filename || storageFilename,
      storageFilename,
      markdown: previewMarkdown,
    });
    setDocumentPanelOpen(true);
    setDocumentPanelView("doc");
  }, [
    offerKpEnabled,
    canPreviewDoc,
    previewMarkdown,
    storageFilename,
    filename,
    setDocPreview,
    setDocumentPanelOpen,
    setDocumentPanelView,
  ]);

  const fetchBlob = useCallback(async () => {
    if (!storageFilename) return null;
    return StorageFiles.download(storageFilename);
  }, [storageFilename]);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await fetchBlob();
      if (!blob) throw new Error("No blob");
      saveAs(blob, filename || storageFilename);
    } catch (e) {
      console.error("[FileDownloadCard] Download failed:", e?.message || e);
    } finally {
      setDownloading(false);
    }
  };

  const handlePreview = async () => {
    if (previewing || !offerKpEnabled) return;

    if (canPreviewDoc) {
      setDocPreview({
        filename: filename || storageFilename,
        storageFilename,
        markdown: previewMarkdown,
      });
      setDocumentPanelOpen(true);
      setDocumentPanelView("doc");
      return;
    }

    if (!isPdf) return;
    setPreviewing(true);
    try {
      const blob = await fetchBlob();
      if (!blob) throw new Error("No blob");
      const blobUrl = URL.createObjectURL(blob);
      setQuotePdfUrl({ url: blobUrl, filename: filename || storageFilename });
      setDocumentPanelOpen(true);
      setDocumentPanelView("pdf");
    } catch (e) {
      console.error("[FileDownloadCard] Preview failed:", e?.message || e);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="flex justify-center w-full my-2">
      <div className="w-full max-w-[750px] mr-4">
        <div className="flex items-center gap-3 bg-theme-bg-secondary light:bg-slate-50 border border-theme-sidebar-border rounded-xl px-3 py-2.5">
          {/* File icon badge */}
          <div
            className={`${badgeBg} ${badgeText} rounded-lg flex items-center justify-center flex-shrink-0 h-[44px] w-[44px] text-xs font-bold select-none`}
          >
            {badge}
          </div>

          {/* Name + type */}
          <div className="flex flex-col min-w-0 flex-1">
            <p className="text-theme-text-primary text-sm font-medium truncate leading-snug">
              {filename || "Unknown file"}
            </p>
            <p className="text-theme-text-secondary text-xs leading-snug">
              {["Document", fileType].filter(Boolean).join(" · ")}
              {fileSize ? ` · ${humanFileSize(fileSize, true, 1)}` : ""}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Open in Preview — PDF only */}
            {offerKpEnabled && (isPdf || canPreviewDoc) && (
              <button
                onClick={handlePreview}
                disabled={previewing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-bg-primary border border-theme-sidebar-border hover:bg-theme-sidebar-item-hover transition-colors text-theme-text-primary text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                title="Open in Preview"
              >
                {previewing ? (
                  <CircleNotch size={13} weight="bold" className="animate-spin" />
                ) : (
                  <Eye size={13} weight="bold" />
                )}
                <span className="hidden sm:inline">Open in Preview</span>
              </button>
            )}

            {/* Download */}
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-theme-sidebar-border hover:bg-theme-sidebar-item-hover transition-colors text-theme-text-secondary text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title="Download"
            >
              {downloading ? (
                <CircleNotch size={13} weight="bold" className="animate-spin" />
              ) : (
                <DownloadSimple size={13} weight="bold" />
              )}
              <span className="hidden sm:inline">
                {downloading ? "Downloading…" : "Download"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getFileDisplayInfo(filename) {
  const extension = filename?.split(".")?.pop()?.toLowerCase() ?? "txt";
  switch (extension) {
    case "pptx":
    case "ppt":
      return {
        badge: "PPT",
        badgeBg: "bg-orange-100",
        badgeText: "text-orange-700",
        fileType: "PowerPoint",
      };
    case "pdf":
      return {
        badge: "PDF",
        badgeBg: "bg-red-100",
        badgeText: "text-red-700",
        fileType: "PDF Document",
      };
    case "doc":
    case "docx":
      return {
        badge: "DOC",
        badgeBg: "bg-blue-100",
        badgeText: "text-blue-700",
        fileType: "Word Document",
      };
    case "xls":
    case "xlsx":
      return {
        badge: "XLS",
        badgeBg: "bg-green-100",
        badgeText: "text-green-700",
        fileType: "Spreadsheet",
      };
    case "csv":
      return {
        badge: "CSV",
        badgeBg: "bg-green-100",
        badgeText: "text-green-700",
        fileType: "Spreadsheet",
      };
    case "txt":
    case "md":
      return {
        badge: "TXT",
        badgeBg: "bg-slate-200",
        badgeText: "text-slate-700",
        fileType: "Text File",
      };
    default:
      return {
        badge: extension.toUpperCase().slice(0, 4),
        badgeBg: "bg-slate-200",
        badgeText: "text-slate-700",
        fileType: "File",
      };
  }
}

export default memo(FileDownloadCard);
