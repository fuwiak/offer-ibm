import { useMemo, useState } from "react";
import MarkdownIt from "markdown-it";
import { saveAs } from "file-saver";
import { X, DownloadSimple, CircleNotch } from "@phosphor-icons/react";
import OfferKp from "@/models/offerKp";
import StorageFiles from "@/models/files";
import { AUTH_TOKEN } from "@/utils/constants";

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

/**
 * Renders an agent-generated document (markdown) as a paper-like preview.
 */
export default function DocPreviewPane({ docPreview, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const html = useMemo(
    () => md.render(docPreview?.markdown || ""),
    [docPreview?.markdown]
  );

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      let blob = null;
      let downloadName = docPreview?.filename || docPreview?.storageFilename;

      if (docPreview?.markdown) {
        const result = await OfferKp.generateDocxFromMarkdown({
          markdown: docPreview.markdown,
          filename: docPreview.filename || "document.docx",
        });
        const token = window.localStorage.getItem(AUTH_TOKEN) || "";
        const res = await fetch(
          OfferKp.quoteDocxDownloadUrl(result.storageFilename),
          { headers: { Authorization: token ? `Bearer ${token}` : "" } }
        );
        if (!res.ok) throw new Error("Download failed");
        blob = await res.blob();
        downloadName = result.filename || downloadName;
      } else if (docPreview?.storageFilename) {
        blob = await StorageFiles.download(docPreview.storageFilename);
      }

      if (!blob) throw new Error("No blob");
      saveAs(blob, downloadName || "document.docx");
    } catch (e) {
      console.error("[DocPreviewPane] download error:", e?.message || e);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0 border-b border-theme-sidebar-border bg-theme-bg-secondary">
        <span
          className="text-xs text-theme-text-secondary truncate min-w-0"
          title={docPreview?.filename}
        >
          {docPreview?.filename || "Document"}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0c7d69] hover:bg-[#0a6757] text-white text-[11px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <CircleNotch size={12} weight="bold" className="animate-spin" />
            ) : (
              <DownloadSimple size={12} weight="bold" />
            )}
            Download
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-theme-text-secondary hover:text-theme-text-primary p-0.5 rounded"
              title="Close preview"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#525659] p-3" translate="no">
        <div
          className="offerKp-doc-preview notranslate"
          translate="no"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
