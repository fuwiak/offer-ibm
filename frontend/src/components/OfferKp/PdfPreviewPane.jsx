import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, DownloadSimple, FileDoc } from "@phosphor-icons/react";
import { downloadBlob } from "@/utils/downloadBlob";

/**
 * PDF preview in the right panel — blob URL + iframe (same as elia_front).
 */
export default function PdfPreviewPane({ quotePdfUrl, onClose }) {
  const { t } = useTranslation("offerKp");
  const [exporting, setExporting] = useState(false);
  const [exportingXls, setExportingXls] = useState(false);

  const xlsUrl = quotePdfUrl?.xlsUrl;

  async function handleExportPdf() {
    if (exporting || !quotePdfUrl?.url) return;
    setExporting(true);
    try {
      const res = await fetch(quotePdfUrl.url);
      const blob = await res.blob();
      await downloadBlob(blob, quotePdfUrl.filename || "document.pdf");
    } catch (e) {
      console.error("[PdfPreviewPane] export PDF:", e?.message || e);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportXls() {
    if (exportingXls || !xlsUrl) return;
    setExportingXls(true);
    try {
      const res = await fetch(xlsUrl);
      const blob = await res.blob();
      const xlsName =
        quotePdfUrl?.xlsFilename ||
        (quotePdfUrl?.filename || "document.pdf").replace(/\.pdf$/i, ".xlsx");
      await downloadBlob(blob, xlsName);
    } catch (e) {
      console.error("[PdfPreviewPane] export XLS:", e?.message || e);
    } finally {
      setExportingXls(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b border-theme-sidebar-border bg-theme-bg-secondary gap-2">
        <span
          className="text-xs text-theme-text-secondary truncate min-w-0"
          title={quotePdfUrl?.filename}
        >
          {quotePdfUrl?.filename || "document.pdf"}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exporting}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <DownloadSimple size={13} weight="bold" />
            {exporting
              ? t("layout.exporting", { defaultValue: "Exporting…" })
              : t("layout.exportPdf", { defaultValue: "Export as PDF" })}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-theme-text-secondary hover:text-theme-text-primary p-0.5 rounded"
              title={t("layout.closePreview", { defaultValue: "Close preview" })}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <iframe
        src={quotePdfUrl?.url}
        title="PDF Preview"
        className="flex-1 w-full border-0 bg-white"
        style={{ minHeight: 0 }}
      />

      <div className="flex items-center gap-2 px-3 py-2.5 shrink-0 border-t border-theme-sidebar-border bg-theme-bg-secondary">
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={exporting}
          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary-button hover:opacity-90 text-white text-xs font-medium transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <DownloadSimple size={14} weight="bold" />
          {exporting ? "…" : t("layout.downloadPdf")}
        </button>
        <button
          type="button"
          onClick={handleExportXls}
          disabled={exportingXls || !xlsUrl}
          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border border-theme-sidebar-border bg-transparent text-theme-text-primary hover:bg-theme-sidebar-item-hover text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            !xlsUrl
              ? t("layout.downloadXlsUnavailable", {
                  defaultValue: "XLS not available for this document",
                })
              : undefined
          }
        >
          <FileDoc size={14} weight="bold" />
          {exportingXls ? "…" : t("layout.downloadXls")}
        </button>
      </div>
    </div>
  );
}
