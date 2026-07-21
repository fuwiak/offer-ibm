import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import MarkdownIt from "markdown-it";
import { X, DownloadSimple, CircleNotch, PencilSimple } from "@phosphor-icons/react";
import { downloadBlob } from "@/utils/downloadBlob";
import { downloadDocxMatchingPreview } from "@/utils/offerKp/quoteFileDownload";
import { useOfferKp } from "@/contexts/OfferKpContext";
import { openQuoteEditor } from "@/utils/offerKp/openQuoteEditor";
import { parseQuoteMarkdown } from "@/utils/offerKp/parseQuoteMarkdown";
import QuotePreview from "@/components/OfferKp/QuotePreview";

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

/**
 * Document tab preview — same paper layout as PDF / Превью КП when a quote
 * draft exists; markdown fallback for legacy agent docs.
 */
export default function DocPreviewPane({ docPreview, onClose }) {
  const { t } = useTranslation("offerKp");
  const {
    quoteDraft,
    setQuoteDraft,
    setDocumentPanelView,
    setDocumentPanelOpen,
    setDocPreview,
  } = useOfferKp();
  const [downloading, setDownloading] = useState(false);

  const hasQuotePaper =
    (quoteDraft?.hardwareLines?.length ?? 0) > 0 ||
    (quoteDraft?.preview?.lines?.length ?? 0) > 0 ||
    !!quoteDraft?.preview;

  const canEdit = useMemo(
    () =>
      hasQuotePaper ||
      parseQuoteMarkdown(docPreview?.markdown || "").length > 0,
    [docPreview?.markdown, hasQuotePaper]
  );
  const html = useMemo(
    () => md.render(docPreview?.markdown || ""),
    [docPreview?.markdown]
  );

  async function handleEdit() {
    try {
      openQuoteEditor({
        markdown: docPreview?.markdown,
        lines: quoteDraft?.hardwareLines || quoteDraft?.preview?.lines,
        reference: quoteDraft?.reference,
        customer: quoteDraft?.customer,
        filename: docPreview?.filename,
        setQuoteDraft,
        setDocumentPanelView,
        setDocumentPanelOpen,
        setDocPreview,
      });
    } catch (e) {
      console.error("[DocPreviewPane] edit error:", e?.message || e);
    }
  }

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const { blob, filename } = await downloadDocxMatchingPreview({
        filename: docPreview?.filename,
        storageFilename: docPreview?.storageFilename,
        previewMarkdown: docPreview?.markdown,
        quoteDraft,
      });
      await downloadBlob(blob, filename || "document.docx");
    } catch (e) {
      console.error("[DocPreviewPane] download error:", e?.message || e);
    } finally {
      setDownloading(false);
    }
  }

  if (hasQuotePaper) {
    return (
      <div className="flex-1 flex flex-col min-h-0 relative">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-2 right-2 z-10 text-theme-text-secondary hover:text-theme-text-primary p-1 rounded bg-theme-bg-secondary/90 border border-theme-sidebar-border"
            title="Close preview"
          >
            <X size={14} />
          </button>
        )}
        <QuotePreview />
      </div>
    );
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
          {canEdit && (
            <button
              type="button"
              onClick={handleEdit}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-theme-sidebar-border hover:bg-theme-sidebar-item-hover text-theme-text-primary text-[11px] font-semibold transition-colors"
            >
              <PencilSimple size={12} weight="bold" />
              {t("layout.editQuoteLines", { defaultValue: "Редактировать" })}
            </button>
          )}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#333333] hover:bg-[#1a1a1a] text-white text-[11px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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

      <div
        className="flex-1 overflow-y-auto bg-[#e8e8e8] p-3 min-h-0"
        translate="no"
      >
        <div
          className="offerKp-doc-preview offerKp-quote-doc notranslate"
          translate="no"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 shrink-0 border-t border-theme-sidebar-border bg-theme-bg-secondary">
        {canEdit && (
          <button
            type="button"
            onClick={handleEdit}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border border-theme-sidebar-border bg-transparent text-theme-text-primary hover:bg-theme-sidebar-item-hover text-xs font-medium transition-colors"
          >
            <PencilSimple size={14} weight="bold" />
            {t("layout.editQuoteLines", { defaultValue: "Редактировать" })}
          </button>
        )}
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
          {downloading
            ? "…"
            : t("layout.downloadDocx", { defaultValue: "Download DOCX" })}
        </button>
      </div>
    </div>
  );
}
