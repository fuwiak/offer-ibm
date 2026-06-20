import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import MarkdownIt from "markdown-it";
import { X, DownloadSimple, CircleNotch } from "@phosphor-icons/react";
import { downloadBlob } from "@/utils/downloadBlob";
import { downloadDocxMatchingPreview } from "@/utils/offerKp/quoteFileDownload";

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

/**
 * Renders an agent-generated document (markdown) as a paper-like preview.
 * Download regenerates DOCX from the same markdown (matches elia_front).
 */
export default function DocPreviewPane({ docPreview, onClose }) {
  const { t } = useTranslation("offerKp");
  const [downloading, setDownloading] = useState(false);
  const html = useMemo(
    () => md.render(docPreview?.markdown || ""),
    [docPreview?.markdown]
  );

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const { blob, filename } = await downloadDocxMatchingPreview({
        filename: docPreview?.filename,
        storageFilename: docPreview?.storageFilename,
        previewMarkdown: docPreview?.markdown,
      });
      await downloadBlob(blob, filename || "document.docx");
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
            {t("layout.downloadDocx", { defaultValue: "Download DOCX" })}
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

      <div className="flex-1 overflow-y-auto bg-[#525659] p-3 min-h-0" translate="no">
        <div
          className="offerKp-doc-preview notranslate"
          translate="no"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 shrink-0 border-t border-theme-sidebar-border bg-theme-bg-secondary">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary-button hover:opacity-90 text-white text-xs font-medium transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {downloading ? (
            <CircleNotch size={14} weight="bold" className="animate-spin" />
          ) : (
            <DownloadSimple size={14} weight="bold" />
          )}
          {downloading ? "…" : t("layout.downloadDocx", { defaultValue: "Download DOCX" })}
        </button>
      </div>
    </div>
  );
}
