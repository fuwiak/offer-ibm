import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CaretDown, CaretRight, CircleNotch, Table } from "@phosphor-icons/react";
import Workspace from "@/models/workspace";

function displayName(file) {
  return file.title || file.filename || "file";
}

function FileExtensionBadge({ file }) {
  const name = displayName(file);
  const parts = name.split(".");
  const ext = parts.length > 1 ? parts.pop().toUpperCase() : "FILE";
  return <span className="offerKp-thread-files__card-type">{ext}</span>;
}

function TabularPreviewTable({ preview, t }) {
  const { headers = [], rows = [], totalRows = 0, offset = 0 } = preview;
  const shownFrom = totalRows === 0 ? 0 : offset + 1;
  const shownTo = Math.min(offset + rows.length, totalRows);

  if (!headers.length && !rows.length) {
    return (
      <p className="offerKp-thread-db-preview__empty text-theme-text-secondary">
        {t("layout.dbPreviewEmpty")}
      </p>
    );
  }

  return (
    <>
      <div className="offerKp-thread-db-preview__table-wrap">
        <table className="offerKp-thread-db-preview__table">
          <thead>
            <tr>
              <th className="offerKp-thread-db-preview__row-num">#</th>
              {headers.map((header, index) => (
                <th key={`${header}-${index}`} title={header}>
                  {header || "—"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="offerKp-thread-db-preview__row-num">
                  {offset + rowIndex + 1}
                </td>
                {headers.map((_, colIndex) => (
                  <td key={colIndex} title={row[colIndex] ?? ""}>
                    {row[colIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="offerKp-thread-db-preview__meta">
        {t("layout.dbPreviewRows", {
          from: shownFrom,
          to: shownTo,
          total: totalRows,
        })}
      </p>
    </>
  );
}

function FileDataPreviewCard({ file, workspaceSlug, threadSlug }) {
  const { t } = useTranslation("offerKp");
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [error, setError] = useState(null);

  const loadPreview = useCallback(
    async (nextSheetIndex = sheetIndex) => {
      if (!workspaceSlug || !threadSlug || !file?.id) return;
      setLoading(true);
      setError(null);
      const result = await Workspace.getParsedFilePreview(
        workspaceSlug,
        file.id,
        { threadSlug, limit: 25, offset: 0, sheetIndex: nextSheetIndex }
      );
      if (!result?.preview) {
        setError(t("layout.dbPreviewLoadError"));
        setPreview(null);
      } else {
        setPreview(result.preview);
      }
      setLoading(false);
    },
    [workspaceSlug, threadSlug, file?.id, sheetIndex, t]
  );

  useEffect(() => {
    loadPreview(sheetIndex);
  }, [loadPreview, sheetIndex]);

  const sheets = preview?.sheets || [];
  const lineCount = file.lineCount ?? preview?.totalRows ?? null;

  return (
    <article className="offerKp-thread-db-preview__card">
      <button
        type="button"
        className="offerKp-thread-db-preview__toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="offerKp-thread-db-preview__toggle-icon">
          {open ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
        </span>
        <Table size={16} weight="duotone" className="offerKp-thread-db-preview__icon" />
        <span className="offerKp-thread-db-preview__title">{displayName(file)}</span>
        {lineCount != null && (
          <span className="offerKp-thread-db-preview__badge">
            {t("layout.fileLines", { count: lineCount })}
          </span>
        )}
      </button>

      {open && (
        <div className="offerKp-thread-db-preview__body">
          {sheets.length > 1 && (
            <div className="offerKp-thread-db-preview__sheets">
              {sheets.map((sheetName, index) => (
                <button
                  key={`${sheetName}-${index}`}
                  type="button"
                  className={`offerKp-thread-db-preview__sheet-tab ${
                    sheetIndex === index
                      ? "offerKp-thread-db-preview__sheet-tab--active"
                      : ""
                  }`}
                  onClick={() => setSheetIndex(index)}
                >
                  {sheetName}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="offerKp-thread-db-preview__loading">
              <CircleNotch size={16} className="animate-spin" />
              <span>{t("layout.dbPreviewLoading")}</span>
            </div>
          ) : error ? (
            <p className="offerKp-thread-db-preview__empty text-theme-text-secondary">
              {error}
            </p>
          ) : preview?.isTabular ? (
            <TabularPreviewTable preview={preview} t={t} />
          ) : preview?.textPreview ? (
            <>
              <pre className="offerKp-thread-db-preview__text">{preview.textPreview}</pre>
              {preview.totalLines > 12 && (
                <p className="offerKp-thread-db-preview__meta">
                  {t("layout.dbPreviewTextTruncated", { total: preview.totalLines })}
                </p>
              )}
            </>
          ) : (
            <p className="offerKp-thread-db-preview__empty text-theme-text-secondary">
              {t("layout.dbPreviewEmpty")}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export default function ThreadFileDataPreview({ files, workspaceSlug, threadSlug }) {
  const { t } = useTranslation("offerKp");
  const previewableFiles = (files || []).filter(
    (file) => file.isTabular || file.lineCount > 0
  );

  if (!threadSlug || previewableFiles.length === 0) return null;

  return (
    <section className="offerKp-thread-db-preview">
      <div className="offerKp-thread-db-preview__head">
        <h4 className="offerKp-thread-db-preview__heading">{t("layout.dbPreviewTitle")}</h4>
        <p className="offerKp-thread-db-preview__hint">{t("layout.dbPreviewHint")}</p>
      </div>
      <div className="offerKp-thread-db-preview__list">
        {previewableFiles.map((file) => (
          <FileDataPreviewCard
            key={file.id}
            file={file}
            workspaceSlug={workspaceSlug}
            threadSlug={threadSlug}
          />
        ))}
      </div>
    </section>
  );
}

export { FileExtensionBadge, displayName };
