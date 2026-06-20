import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { saveAs } from "file-saver";
import {
  DownloadSimple,
  CircleNotch,
  Eye,
  FilePdf,
  FileDoc,
} from "@phosphor-icons/react";
import { useOfferKp } from "@/contexts/OfferKpContext";
import { humanFileSize } from "@/utils/numbers";
import { downloadQuoteFileBlob } from "@/utils/offerKp/quoteFileDownload";
import { openStoredFilePreview } from "@/utils/offerKp/openQuoteFilePreview";

function fileIcon(kind, filename = "") {
  if (kind === "pdf" || /\.pdf$/i.test(filename)) return FilePdf;
  return FileDoc;
}

export default function ThreadGeneratedQuotesSection({ files = [] }) {
  const { t } = useTranslation("offerKp");
  const {
    quotePdfUrl,
    setDocumentPanelView,
    setDocumentPanelOpen,
    setQuotePdfUrl,
    setDocPreview,
  } = useOfferKp();
  const [busyKey, setBusyKey] = useState(null);

  const handleDownload = useCallback(async (file) => {
    const key = file.storageFilename;
    if (!key || busyKey) return;
    setBusyKey(`dl:${key}`);
    try {
      const blob = await downloadQuoteFileBlob({
        storageFilename: file.storageFilename,
        filename: file.filename,
      });
      saveAs(blob, file.filename || file.storageFilename);
    } catch (e) {
      console.error("[ThreadGeneratedQuotesSection] download:", e?.message || e);
    } finally {
      setBusyKey(null);
    }
  }, [busyKey]);

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
        console.error("[ThreadGeneratedQuotesSection] preview:", e?.message || e);
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

  if (!files.length) return null;

  return (
    <section className="offerKp-thread-panel-section offerKp-thread-panel-section--quotes">
      <div className="offerKp-thread-panel-section__head">
        <h3 className="offerKp-thread-panel-section__title">
          {t("layout.generatedDocuments")}
        </h3>
      </div>
      <ul className="offerKp-thread-quotes__list">
        {files.map((file) => {
          const Icon = fileIcon(file.kind, file.filename);
          const isPdf =
            file.kind === "pdf" || /\.pdf$/i.test(file.filename || "");
          const canPreviewDoc = !!file.previewMarkdown;
          const busy =
            busyKey === `dl:${file.storageFilename}` ||
            busyKey === `pv:${file.storageFilename}`;

          return (
            <li key={file.storageFilename} className="offerKp-thread-quotes__item">
              <Icon
                size={20}
                weight="duotone"
                className="offerKp-thread-quotes__icon shrink-0"
              />
              <div className="offerKp-thread-quotes__meta min-w-0 flex-1">
                <span className="offerKp-thread-quotes__name truncate block">
                  {file.filename || file.storageFilename}
                </span>
                {file.fileSize ? (
                  <span className="offerKp-thread-quotes__size">
                    {humanFileSize(file.fileSize, true, 1)}
                  </span>
                ) : null}
              </div>
              <div className="offerKp-thread-quotes__actions shrink-0 flex gap-1">
                {(isPdf || canPreviewDoc) && (
                  <button
                    type="button"
                    className="offerKp-thread-quotes__btn"
                    title={t("layout.openPreview", { defaultValue: "Preview" })}
                    disabled={busy}
                    onClick={() => handlePreview(file)}
                  >
                    {busy && busyKey?.startsWith("pv:") ? (
                      <CircleNotch size={14} className="animate-spin" />
                    ) : (
                      <Eye size={14} weight="bold" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className="offerKp-thread-quotes__btn"
                  title={t("layout.downloadPdf", { defaultValue: "Download" })}
                  disabled={busy}
                  onClick={() => handleDownload(file)}
                >
                  {busy && busyKey?.startsWith("dl:") ? (
                    <CircleNotch size={14} className="animate-spin" />
                  ) : (
                    <DownloadSimple size={14} weight="bold" />
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
