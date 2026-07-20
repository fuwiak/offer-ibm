import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  CircleNotch,
  DownloadSimple,
  FileDoc,
  FilePdf,
  PencilSimple,
} from "@phosphor-icons/react";
import { useOfferKp } from "@/contexts/OfferKpContext";
import { downloadBlob } from "@/utils/downloadBlob";
import { downloadFileMatchingPreview } from "@/utils/offerKp/quoteFileDownload";
import { openStoredFilePreview } from "@/utils/offerKp/openQuoteFilePreview";
import { openQuoteEditor } from "@/utils/offerKp/openQuoteEditor";
import { parseQuoteMarkdown } from "@/utils/offerKp/parseQuoteMarkdown";

function isPdfFile(file) {
  return file?.kind === "pdf" || /\.pdf$/i.test(file?.filename || "");
}

function shortLabel(filename = "") {
  const base = String(filename).replace(/\.[^.]+$/, "");
  if (base.length <= 18) return base || filename;
  return `${base.slice(0, 16)}…`;
}

export default function GeneratedQuotesDock({ files = [] }) {
  const { t } = useTranslation("offerKp");
  const {
    quoteDraft,
    setQuoteDraft,
    quotePdfUrl,
    setDocumentPanelView,
    setDocumentPanelOpen,
    setQuotePdfUrl,
    setDocPreview,
    docPreview,
  } = useOfferKp();
  const [busyKey, setBusyKey] = useState(null);

  const handlePreview = useCallback(
    async (file) => {
      const key = file.storageFilename;
      if (!key || busyKey) return;
      setBusyKey(`pv:${key}`);
      try {
        await openStoredFilePreview({
          filename: file.filename,
          storageFilename: file.storageFilename,
          previewMarkdown: file.previewMarkdown,
          setQuotePdfUrl,
          setDocumentPanelOpen,
          setDocumentPanelView,
          setDocPreview,
          previousPdfUrl: quotePdfUrl?.url,
        });
      } catch (e) {
        console.error("[GeneratedQuotesDock] preview:", e?.message || e);
      } finally {
        setBusyKey(null);
      }
    },
    [
      busyKey,
      setDocPreview,
      setDocumentPanelOpen,
      setDocumentPanelView,
      setQuotePdfUrl,
      quotePdfUrl?.url,
    ]
  );

  const handleDownload = useCallback(
    async (file) => {
      const key = file.storageFilename;
      if (!key || busyKey) return;
      setBusyKey(`dl:${key}`);
      try {
        const { blob, filename: saveName } = await downloadFileMatchingPreview({
          storageFilename: file.storageFilename,
          filename: file.filename,
          previewMarkdown: file.previewMarkdown,
        });
        await downloadBlob(blob, saveName);
      } catch (e) {
        console.error("[GeneratedQuotesDock] download:", e?.message || e);
      } finally {
        setBusyKey(null);
      }
    },
    [busyKey]
  );

  const handleEdit = useCallback(
    (file) => {
      const key = file.storageFilename;
      if (!key || busyKey || !file.previewMarkdown) return;
      if (!parseQuoteMarkdown(file.previewMarkdown).length) return;
      setBusyKey(`ed:${key}`);
      try {
        openQuoteEditor({
          markdown: file.previewMarkdown,
          lines: quoteDraft?.hardwareLines,
          reference: quoteDraft?.reference,
          customer: quoteDraft?.customer,
          filename: file.filename,
          setQuoteDraft,
          setDocumentPanelOpen,
          setDocumentPanelView,
          setDocPreview,
        });
      } catch (e) {
        console.error("[GeneratedQuotesDock] edit:", e?.message || e);
      } finally {
        setBusyKey(null);
      }
    },
    [
      busyKey,
      quoteDraft?.hardwareLines,
      quoteDraft?.reference,
      quoteDraft?.customer,
      setQuoteDraft,
      setDocumentPanelOpen,
      setDocumentPanelView,
      setDocPreview,
    ]
  );

  if (!files.length) return null;

  return (
    <nav
      className="offerKp-quotes-dock"
      aria-label={t("layout.generatedDocuments")}
    >
      <div className="offerKp-quotes-dock__bar" role="list">
        {files.map((file) => {
          const pdf = isPdfFile(file);
          const Icon = pdf ? FilePdf : FileDoc;
          const canPreview = pdf || !!file.previewMarkdown;
          const canEdit =
            !!file.previewMarkdown &&
            parseQuoteMarkdown(file.previewMarkdown).length > 0;
          const active =
            (pdf &&
              quotePdfUrl?.filename &&
              quotePdfUrl.filename === file.filename) ||
            (!pdf &&
              docPreview?.storageFilename &&
              docPreview.storageFilename === file.storageFilename);
          const busy =
            busyKey === `dl:${file.storageFilename}` ||
            busyKey === `pv:${file.storageFilename}` ||
            busyKey === `ed:${file.storageFilename}`;
          const name = file.filename || file.storageFilename;

          return (
            <div
              key={file.storageFilename}
              className={[
                "offerKp-quotes-dock__item",
                active ? "offerKp-quotes-dock__item--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="listitem"
            >
              <button
                type="button"
                className="offerKp-quotes-dock__launch"
                title={name}
                disabled={busy || !canPreview}
                onClick={() => handlePreview(file)}
              >
                <span
                  className={[
                    "offerKp-quotes-dock__icon",
                    pdf
                      ? "offerKp-quotes-dock__icon--pdf"
                      : "offerKp-quotes-dock__icon--doc",
                  ].join(" ")}
                >
                  {busy && busyKey?.startsWith("pv:") ? (
                    <CircleNotch size={22} className="animate-spin" />
                  ) : (
                    <Icon size={22} weight="fill" />
                  )}
                </span>
                <span className="offerKp-quotes-dock__label">
                  {shortLabel(name)}
                </span>
                <span className="offerKp-quotes-dock__ext">
                  {pdf ? "PDF" : "DOC"}
                </span>
              </button>
              <div className="offerKp-quotes-dock__actions">
                {canEdit && (
                  <button
                    type="button"
                    className="offerKp-quotes-dock__action"
                    title={t("layout.editQuoteLines", { defaultValue: "Edit" })}
                    disabled={busy}
                    onClick={() => handleEdit(file)}
                  >
                    {busy && busyKey?.startsWith("ed:") ? (
                      <CircleNotch size={12} className="animate-spin" />
                    ) : (
                      <PencilSimple size={12} weight="bold" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className="offerKp-quotes-dock__action"
                  title={t("layout.downloadPdf", { defaultValue: "Download" })}
                  disabled={busy}
                  onClick={() => handleDownload(file)}
                >
                  {busy && busyKey?.startsWith("dl:") ? (
                    <CircleNotch size={12} className="animate-spin" />
                  ) : (
                    <DownloadSimple size={12} weight="bold" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
