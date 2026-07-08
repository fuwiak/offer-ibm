import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CaretLeft, FilePdf } from "@phosphor-icons/react";
import { useOfferKp } from "@/contexts/OfferKpContext";
import Workspace from "@/models/workspace";
import PdfJsViewer from "@/components/OfferKp/PdfJsViewer";
import {
  openUploadedFilePreview,
  revokeUploadedPdfBlob,
} from "@/utils/offerKp/openUploadedPdfPreview";

function isPdfFile(file) {
  return !!file?.isPdf;
}

/**
 * Resizable sidebar with the uploaded source PDF for side-by-side comparison
 * with generated KP output in the right DocumentPanel.
 */
export default function UploadedPdfSidebar() {
  const { t } = useTranslation("offerKp");
  const {
    enabled,
    activeWorkspaceSlug,
    activeThreadSlug,
    uploadedPdfPreview,
    setUploadedPdfPreview,
    uploadedPdfSidebarOpen,
    setUploadedPdfSidebarOpen,
  } = useOfferKp();

  const PANEL_MIN_WIDTH = 280;
  const PANEL_WIDTH_STORAGE_KEY = "offerKp_uploaded_pdf_width";
  const [panelWidth, setPanelWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= PANEL_MIN_WIDTH ? stored : 360;
  });
  const [pdfFiles, setPdfFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [opening, setOpening] = useState(false);
  const panelWidthRef = useRef(panelWidth);
  const resizingRef = useRef(false);
  const asideRef = useRef(null);
  const previewUrlRef = useRef(uploadedPdfPreview?.url || null);
  const autoOpenAttemptRef = useRef(null);

  useEffect(() => {
    panelWidthRef.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    previewUrlRef.current = uploadedPdfPreview?.url || null;
  }, [uploadedPdfPreview?.url]);

  useEffect(() => {
    autoOpenAttemptRef.current = null;
  }, [activeThreadSlug]);

  useEffect(
    () => () => {
      revokeUploadedPdfBlob(previewUrlRef.current);
    },
    []
  );

  useEffect(() => {
    function onMove(e) {
      if (!resizingRef.current) return;
      e.preventDefault();
      const rect = asideRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxWidth = Math.max(PANEL_MIN_WIDTH, window.innerWidth - 720);
      const next = Math.min(
        maxWidth,
        Math.max(PANEL_MIN_WIDTH, e.clientX - rect.left)
      );
      setPanelWidth(next);
    }
    function onUp() {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.localStorage.setItem(
        PANEL_WIDTH_STORAGE_KEY,
        String(Math.round(panelWidthRef.current))
      );
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const loadPdfFiles = useCallback(async () => {
    if (!enabled || !activeWorkspaceSlug || !activeThreadSlug) {
      setPdfFiles([]);
      return [];
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await Workspace.getParsedFiles(
        activeWorkspaceSlug,
        activeThreadSlug
      );
      const files = (data?.files || []).filter(isPdfFile);
      setPdfFiles(files);
      return files;
    } catch (e) {
      setLoadError(e?.message || String(e));
      setPdfFiles([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [enabled, activeWorkspaceSlug, activeThreadSlug]);

  const openFile = useCallback(
    async (file) => {
      if (!file?.id || opening) return;
      setOpening(true);
      setLoadError(null);
      try {
        await openUploadedFilePreview({
          workspaceSlug: activeWorkspaceSlug,
          threadSlug: activeThreadSlug,
          file,
          setUploadedPdfPreview,
          setUploadedPdfSidebarOpen,
          previousUrl: uploadedPdfPreview?.url,
          fetchTextPreview: async () => {
            const result = await Workspace.getParsedFilePreview(
              activeWorkspaceSlug,
              file.id,
              { threadSlug: activeThreadSlug, limit: 80, offset: 0 }
            );
            return result?.preview || null;
          },
        });
      } catch (e) {
        setLoadError(
          e?.message ||
            t("layout.uploadedPdfUnavailable", {
              defaultValue: "Original PDF is not available for this file.",
            })
        );
      } finally {
        setOpening(false);
      }
    },
    [
      activeWorkspaceSlug,
      activeThreadSlug,
      opening,
      setUploadedPdfPreview,
      setUploadedPdfSidebarOpen,
      t,
      uploadedPdfPreview?.url,
    ]
  );

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    async function sync() {
      const files = await loadPdfFiles();
      if (cancelled || !files.length) return;
      const currentId = uploadedPdfPreview?.fileId;
      const stillValid = files.some((f) => f.id === currentId);
      const attemptKey = `${activeThreadSlug}:${files[0]?.id}`;
      if (
        !stillValid &&
        !opening &&
        autoOpenAttemptRef.current !== attemptKey
      ) {
        autoOpenAttemptRef.current = attemptKey;
        await openFile(files[0]);
      } else if (!uploadedPdfSidebarOpen && files.length) {
        setUploadedPdfSidebarOpen(true);
      }
    }

    sync();
    const refresh = () => {
      loadPdfFiles();
    };
    window.addEventListener("offerKp:thread-files-changed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("offerKp:thread-files-changed", refresh);
    };
  }, [
    enabled,
    activeWorkspaceSlug,
    activeThreadSlug,
    loadPdfFiles,
    openFile,
    opening,
    setUploadedPdfSidebarOpen,
    uploadedPdfPreview?.fileId,
    uploadedPdfSidebarOpen,
  ]);

  function startResize(e) {
    e.preventDefault();
    resizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  if (!enabled || !activeThreadSlug) return null;
  if (!pdfFiles.length && !uploadedPdfPreview && !loading) return null;

  const showPdfPreview =
    uploadedPdfSidebarOpen &&
    uploadedPdfPreview?.mode === "pdf" &&
    !!uploadedPdfPreview?.url;
  const showTextPreview =
    uploadedPdfSidebarOpen &&
    uploadedPdfPreview?.mode === "text" &&
    !!uploadedPdfPreview?.textPreview;

  return (
    <aside
      ref={asideRef}
      className={`offerKp-uploaded-pdf-panel relative hidden xl:flex flex-col shrink-0 h-full transition-[width] duration-300 ease-in-out ${
        uploadedPdfSidebarOpen ? "" : "w-10 items-center"
      }`}
      style={uploadedPdfSidebarOpen ? { width: panelWidth } : undefined}
      aria-label={t("layout.uploadedPdfPanel", {
        defaultValue: "Uploaded PDF",
      })}
    >
      {uploadedPdfSidebarOpen && (
        <div
          className="offerKp-uploaded-pdf-panel__resizer"
          onMouseDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label={t("layout.resizePanel", { defaultValue: "Resize panel" })}
        />
      )}

      {uploadedPdfSidebarOpen ? (
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-theme-sidebar-border shrink-0 w-full gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <FilePdf size={14} weight="fill" className="shrink-0 text-[#da1e28]" />
            <span className="offerKp-document-panel__eyebrow truncate">
              {t("layout.uploadedPdfPanel", { defaultValue: "Uploaded PDF" })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setUploadedPdfSidebarOpen(false)}
            className="text-theme-text-secondary hover:text-theme-text-primary border-none bg-transparent p-1 cursor-pointer shrink-0"
            aria-label={t("layout.collapsePanel", { defaultValue: "Collapse panel" })}
          >
            <CaretLeft size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setUploadedPdfSidebarOpen(true)}
          className="text-theme-text-secondary hover:text-theme-text-primary border-none bg-transparent p-2 mt-3 cursor-pointer"
          aria-label={t("layout.uploadedPdfPanel", {
            defaultValue: "Uploaded PDF",
          })}
          title={t("layout.uploadedPdfHint", {
            defaultValue: "Compare with uploaded PDF",
          })}
        >
          <FilePdf size={18} weight="duotone" />
        </button>
      )}

      {uploadedPdfSidebarOpen && (
        <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full">
          {pdfFiles.length > 1 && (
            <div className="px-3 py-2 border-b border-theme-sidebar-border shrink-0">
              <label className="sr-only" htmlFor="uploaded-pdf-select">
                {t("layout.uploadedPdfSelect", { defaultValue: "Source file" })}
              </label>
              <select
                id="uploaded-pdf-select"
                className="w-full text-xs rounded-md border border-theme-sidebar-border bg-theme-bg-chat-input text-theme-text-primary px-2 py-1.5"
                value={uploadedPdfPreview?.fileId || pdfFiles[0]?.id || ""}
                onChange={(e) => {
                  const next = pdfFiles.find(
                    (f) => String(f.id) === e.target.value
                  );
                  if (next) openFile(next);
                }}
                disabled={opening}
              >
                {pdfFiles.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.title || file.filename}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="px-3 py-1.5 shrink-0 border-b border-theme-sidebar-border">
            <span
              className="text-[11px] text-theme-text-secondary truncate block"
              title={uploadedPdfPreview?.filename}
            >
              {uploadedPdfPreview?.filename || pdfFiles[0]?.title || "…"}
            </span>
            <span className="text-[10px] text-theme-text-secondary/80">
              {showTextPreview
                ? t("layout.uploadedPdfTextFallback", {
                    defaultValue: "Parsed text (original PDF unavailable)",
                  })
                : t("layout.uploadedPdfHint", {
                    defaultValue: "Compare with uploaded PDF",
                  })}
            </span>
          </div>

          {loading || opening ? (
            <p className="p-4 text-xs text-theme-text-secondary">…</p>
          ) : loadError ? (
            <p className="p-4 text-xs text-red-500">{loadError}</p>
          ) : showPdfPreview ? (
            <PdfJsViewer
              url={uploadedPdfPreview.url}
              title={uploadedPdfPreview.filename || "Uploaded PDF"}
            />
          ) : showTextPreview ? (
            <div className="flex flex-col flex-1 min-h-0 overflow-auto p-3">
              <pre className="offerKp-thread-db-preview__text text-xs whitespace-pre-wrap">
                {uploadedPdfPreview.textPreview}
              </pre>
              {uploadedPdfPreview.totalLines > 80 && (
                <p className="text-[10px] text-theme-text-secondary mt-2">
                  {t("layout.dbPreviewTextTruncated", {
                    total: uploadedPdfPreview.totalLines,
                  })}
                </p>
              )}
            </div>
          ) : (
            <p className="p-4 text-xs text-theme-text-secondary">
              {t("layout.uploadedPdfUnavailable", {
                defaultValue: "Original PDF is not available for this file.",
              })}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

export { openUploadedFilePreview };
