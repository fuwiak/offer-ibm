import { useTranslation } from "react-i18next";
import { useOfferKp } from "@/contexts/OfferKpContext";
import {
  X,
  Plus,
  FilePdf,
  FileDoc,
  FileHtml,
  CaretLeft,
  CaretRight,
  NotePencil,
} from "@phosphor-icons/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import Workspace from "@/models/workspace";
import { getThreadMeta, setThreadMeta } from "@/utils/offerKp/threadMeta";
import { extractUserMemoryNotes } from "@/utils/offerKp/leadsInboxContext";
import OfferKpThreadPanelSection from "@/components/OfferKp/OfferKpThreadPanelSection";
import ExamplePromptsPanel from "@/components/OfferKp/ExamplePromptsPanel";
import QuoteStepper from "@/components/OfferKp/QuoteStepper";
import QuotePreview from "@/components/OfferKp/QuotePreview";
import QuoteDraftTable from "@/components/OfferKp/QuoteDraftTable";
import DocPreviewPane from "@/components/OfferKp/DocPreviewPane";
import PdfPreviewPane from "@/components/OfferKp/PdfPreviewPane";
import CurrentWorkspaceIndicator from "@/components/OfferKp/CurrentWorkspaceIndicator";
import useOfferKpRole from "@/hooks/useOfferKpRole";
import {
  canShowAdminThreadContextPanel,
  canShowThreadFilesPanel,
} from "@/utils/offerKp/threadPanelAccess";
import ThreadFileDataPreview, {
  FileExtensionBadge,
  displayName,
} from "@/components/OfferKp/ThreadFileDataPreview";
import GeneratedQuotesDock from "@/components/OfferKp/GeneratedQuotesDock";
import { openUploadedFilePreview } from "@/utils/offerKp/openUploadedPdfPreview";
import PdfJsViewer from "@/components/OfferKp/PdfJsViewer";

function fileExtension(filename = "") {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop().toUpperCase() : "FILE";
}

function fileIcon(ext) {
  if (ext === "PDF") return FilePdf;
  if (ext === "HTML" || ext === "HTM") return FileHtml;
  return FileDoc;
}

/**
 * Thread files + inline source-PDF preview for side-by-side comparison
 * with «Сводка позиций» (draft table tab next to this «Диалог» tab).
 */
function ThreadFilesSection({
  workspaceSlug,
  threadSlug,
  onAttach,
  embedPdfPreview = false,
}) {
  const { t } = useTranslation("offerKp");
  const {
    setUploadedPdfPreview,
    setUploadedPdfSidebarOpen,
    uploadedPdfPreview,
  } = useOfferKp();
  const [files, setFiles] = useState([]);
  const [capacityPct, setCapacityPct] = useState(0);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const autoOpenedRef = useRef(null);

  const loadFiles = useCallback(async () => {
    if (!workspaceSlug || !threadSlug) {
      setFiles([]);
      setCapacityPct(0);
      setLoading(false);
      return [];
    }
    setLoading(true);
    const data = await Workspace.getParsedFiles(workspaceSlug, threadSlug);
    const nextFiles = data?.files || [];
    setFiles(nextFiles);
    const window = data?.contextWindow || 0;
    const used = data?.currentContextTokenCount || 0;
    setCapacityPct(
      window > 0 ? Math.min(100, Math.round((used / window) * 100)) : 0
    );
    setLoading(false);
    return nextFiles;
  }, [workspaceSlug, threadSlug]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    const refresh = () => loadFiles();
    window.addEventListener("offerKp:thread-files-changed", refresh);
    return () =>
      window.removeEventListener("offerKp:thread-files-changed", refresh);
  }, [loadFiles]);

  const handleOpenUploadedPdf = useCallback(
    async (file, { openSidebar = true } = {}) => {
      if (!file?.isPdf || !workspaceSlug || opening) return;
      setOpening(true);
      try {
        await openUploadedFilePreview({
          workspaceSlug,
          threadSlug,
          file,
          setUploadedPdfPreview,
          setUploadedPdfSidebarOpen: openSidebar
            ? setUploadedPdfSidebarOpen
            : () => {},
          previousUrl: uploadedPdfPreview?.url,
          fetchTextPreview: async () => {
            const result = await Workspace.getParsedFilePreview(
              workspaceSlug,
              file.id,
              { threadSlug, limit: 80, offset: 0 }
            );
            return result?.preview || null;
          },
        });
        if (openSidebar) setUploadedPdfSidebarOpen(true);
      } catch (e) {
        console.error(
          "[ThreadFilesSection] uploaded PDF preview:",
          e?.message || e
        );
      } finally {
        setOpening(false);
      }
    },
    [
      workspaceSlug,
      threadSlug,
      opening,
      setUploadedPdfPreview,
      setUploadedPdfSidebarOpen,
      uploadedPdfPreview?.url,
    ]
  );

  useEffect(() => {
    if (!embedPdfPreview || loading || opening) return;
    const pdfs = files.filter((f) => f.isPdf);
    if (!pdfs.length) return;
    const currentId = uploadedPdfPreview?.fileId;
    const stillValid = pdfs.some((f) => f.id === currentId);
    const key = `${threadSlug}:${pdfs[0].id}`;
    if (stillValid || autoOpenedRef.current === key) return;
    autoOpenedRef.current = key;
    handleOpenUploadedPdf(pdfs[0], { openSidebar: true });
  }, [
    embedPdfPreview,
    loading,
    opening,
    files,
    uploadedPdfPreview?.fileId,
    threadSlug,
    handleOpenUploadedPdf,
  ]);

  const pdfFiles = files.filter((f) => f.isPdf);
  const showEmbeddedPdf =
    embedPdfPreview &&
    uploadedPdfPreview?.mode === "pdf" &&
    !!uploadedPdfPreview?.url;
  const showEmbeddedText =
    embedPdfPreview &&
    uploadedPdfPreview?.mode === "text" &&
    !!uploadedPdfPreview?.textPreview;

  return (
    <section
      className={`offerKp-thread-panel-section offerKp-thread-panel-section--files${
        embedPdfPreview ? " offerKp-thread-panel-section--files-pdf" : ""
      }`}
    >
      <div className="offerKp-thread-panel-section__head">
        <h3 className="offerKp-thread-panel-section__title">
          {embedPdfPreview
            ? t("layout.uploadedPdfPanel", { defaultValue: "Uploaded PDF" })
            : t("layout.files")}
        </h3>
        <button
          type="button"
          className="offerKp-thread-panel-section__edit"
          onClick={onAttach}
          aria-label={t("layout.attachFile")}
        >
          <Plus size={18} weight="bold" />
        </button>
      </div>
      {threadSlug && capacityPct > 0 && (
        <div className="offerKp-thread-files__capacity">
          <div
            className="offerKp-thread-files__capacity-bar"
            style={{ width: `${capacityPct}%` }}
          />
          <span className="offerKp-thread-files__capacity-label">
            {t("layout.capacityUsed", { pct: capacityPct })}
          </span>
        </div>
      )}
      {loading ? (
        <p className="offerKp-thread-panel-section__body text-theme-text-secondary">
          …
        </p>
      ) : !threadSlug ? (
        <p className="offerKp-thread-panel-section__body text-theme-text-secondary">
          {t("layout.selectConversation")}
        </p>
      ) : files.length === 0 ? (
        <p className="offerKp-thread-panel-section__body text-theme-text-secondary">
          {t("layout.filesEmpty")}
        </p>
      ) : (
        <>
          {pdfFiles.length > 0 && (
            <div className="px-0 pb-2">
              {pdfFiles.length > 1 ? (
                <select
                  className="w-full text-xs rounded-md border border-theme-sidebar-border bg-theme-bg-chat-input text-theme-text-primary px-2 py-1.5"
                  value={uploadedPdfPreview?.fileId || pdfFiles[0]?.id || ""}
                  onChange={(e) => {
                    const next = pdfFiles.find(
                      (f) => String(f.id) === e.target.value
                    );
                    if (next) handleOpenUploadedPdf(next, { openSidebar: true });
                  }}
                  disabled={opening}
                >
                  {pdfFiles.map((file) => (
                    <option key={file.id} value={file.id}>
                      {displayName(file)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[11px] text-theme-text-secondary truncate">
                  {displayName(pdfFiles[0])}
                </p>
              )}
              <p className="text-[10px] text-theme-text-secondary/80 mt-0.5">
                {t("layout.uploadedPdfHint", {
                  defaultValue: "Compare with uploaded PDF",
                })}
              </p>
            </div>
          )}

          {showEmbeddedPdf ? (
            <div className="offerKp-thread-pdf-embed flex-1 min-h-[280px] min-w-0 rounded-md border border-theme-sidebar-border overflow-hidden">
              <PdfJsViewer
                url={uploadedPdfPreview.url}
                title={uploadedPdfPreview.filename || "Uploaded PDF"}
              />
            </div>
          ) : showEmbeddedText ? (
            <div className="offerKp-thread-pdf-embed flex-1 min-h-[200px] overflow-auto p-2 rounded-md border border-theme-sidebar-border">
              <pre className="offerKp-thread-db-preview__text text-xs whitespace-pre-wrap">
                {uploadedPdfPreview.textPreview}
              </pre>
            </div>
          ) : pdfFiles.length > 0 && (opening || loading) ? (
            <p className="text-xs text-theme-text-secondary py-4">…</p>
          ) : (
            <ul className="offerKp-thread-files__grid">
              {files.map((file) => {
                const ext = fileExtension(displayName(file));
                const Icon = fileIcon(ext);
                const lines = file.lineCount;
                return (
                  <li key={file.id} className="offerKp-thread-files__card">
                    <button
                      type="button"
                      className={`offerKp-thread-files__card-btn${
                        file.isPdf ? " offerKp-thread-files__card-btn--pdf" : ""
                      }`}
                      onClick={() =>
                        handleOpenUploadedPdf(file, { openSidebar: true })
                      }
                      disabled={!file.isPdf || opening}
                      title={
                        file.isPdf
                          ? t("layout.openUploadedPdf", {
                              defaultValue: "Open uploaded PDF",
                            })
                          : undefined
                      }
                    >
                      <Icon
                        size={22}
                        weight="duotone"
                        className="offerKp-thread-files__card-icon"
                      />
                      <span className="offerKp-thread-files__card-name">
                        {displayName(file)}
                      </span>
                      {lines != null && (
                        <span className="offerKp-thread-files__card-meta">
                          {t("layout.fileLines", { count: lines })}
                        </span>
                      )}
                      <FileExtensionBadge file={file} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {!embedPdfPreview && (
        <ThreadFileDataPreview
          files={files}
          workspaceSlug={workspaceSlug}
          threadSlug={threadSlug}
        />
      )}
    </section>
  );
}

export default function DocumentPanel() {
  const { t } = useTranslation("offerKp");
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const {
    documentPanelOpen,
    setDocumentPanelOpen,
    activeWorkspaceSlug,
    activeThreadSlug,
    documentPanelView,
    setDocumentPanelView,
    quoteDraft,
    quotePdfUrl,
    setQuotePdfUrl,
    docPreview,
    setDocPreview,
    threadQuoteFiles,
    matchProgress,
    setUploadedPdfSidebarOpen,
  } = useOfferKp();

  const { role } = useOfferKpRole();
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [memory, setMemory] = useState("");
  const [userMemoryNotes, setUserMemoryNotes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [contextWidgetOpen, setContextWidgetOpen] = useState(false);
  /** User explicitly opened «Диалог» — do not auto-steal focus to Documents. */
  const preferDialogTabRef = useRef(false);

  const PANEL_MIN_WIDTH = 280;
  const PANEL_WIDTH_STORAGE_KEY = "offerKp_doc_panel_width";
  const [panelWidth, setPanelWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= PANEL_MIN_WIDTH ? stored : 380;
  });
  const panelWidthRef = useRef(panelWidth);
  const resizingRef = useRef(false);

  useEffect(() => {
    panelWidthRef.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    function onMove(e) {
      if (!resizingRef.current) return;
      e.preventDefault();
      const maxWidth = Math.max(PANEL_MIN_WIDTH, window.innerWidth - 360);
      const next = Math.min(
        maxWidth,
        Math.max(PANEL_MIN_WIDTH, window.innerWidth - e.clientX)
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

  function startResize(e) {
    e.preventDefault();
    resizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  useEffect(() => {
    if (!activeWorkspaceSlug) {
      setActiveWorkspace(null);
      return;
    }
    let cancelled = false;
    Workspace.bySlug(activeWorkspaceSlug).then((ws) => {
      if (!cancelled) setActiveWorkspace(ws);
    });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceSlug]);

  const showAdminThreadContext = canShowAdminThreadContextPanel({
    workspace: activeWorkspace,
    userRole: role,
  });
  const showThreadFiles =
    !!activeWorkspaceSlug &&
    !!activeThreadSlug &&
    canShowThreadFilesPanel({
      workspace: activeWorkspace,
      userRole: role,
    });

  useEffect(() => {
    if (!activeWorkspaceSlug || !activeThreadSlug) {
      setUserMemoryNotes("");
      setInstructions("");
      setMemory("");
      return;
    }
    const meta = getThreadMeta(activeWorkspaceSlug, activeThreadSlug);
    const notes = extractUserMemoryNotes(meta.memory);
    setUserMemoryNotes(notes);
    setInstructions(meta.instructions);
    setMemory(notes);
  }, [activeWorkspaceSlug, activeThreadSlug]);

  function persistMemory(fullValue) {
    const notes = extractUserMemoryNotes(fullValue);
    setUserMemoryNotes(notes);
    setMemory(notes);
    if (activeWorkspaceSlug && activeThreadSlug) {
      setThreadMeta(activeWorkspaceSlug, activeThreadSlug, { memory: notes });
    }
  }

  function persistInstructions(value) {
    setInstructions(value);
    if (activeWorkspaceSlug && activeThreadSlug) {
      setThreadMeta(activeWorkspaceSlug, activeThreadSlug, {
        instructions: value,
      });
    }
  }

  function handleAttach() {
    document.getElementById("dnd-chat-file-uploader")?.click();
  }

  const hasEditableQuoteLines =
    (quoteDraft?.hardwareLines?.length ?? 0) > 0 ||
    (quoteDraft?.preview?.lines?.length ?? 0) > 0;
  const isMatchingInProgress =
    matchProgress?.stage === "parsing" || matchProgress?.stage === "searching";
  const hasQuoteBuilderContent =
    !!quoteDraft?.reference ||
    (quoteDraft?.step ?? 0) > 0 ||
    hasEditableQuoteLines;
  const showQuoteBuilder =
    documentPanelView === "builder" && hasQuoteBuilderContent;
  const showDraftTable =
    documentPanelView === "draftTable" &&
    (hasEditableQuoteLines || isMatchingInProgress);
  const showPdfPreview = documentPanelView === "pdf" && !!quotePdfUrl;
  const showQuotePreview =
    documentPanelView === "quotePreview" && !!quoteDraft?.preview;
  const showDocPreview = documentPanelView === "doc" && !!docPreview?.markdown;
  const hasFilePreview = showPdfPreview || showDocPreview;
  const hasQuoteFiles = threadQuoteFiles.length > 0;
  /** Active quote UI (builder/preview) — not merely presence of generated files. */
  const hasActiveQuoteWorkspace =
    showQuoteBuilder ||
    showDraftTable ||
    showPdfPreview ||
    showQuotePreview ||
    showDocPreview ||
    // Keep the Documents panel (not the Диалог widget) while content exists
    // but the tab has not been switched yet.
    hasEditableQuoteLines ||
    hasQuoteBuilderContent ||
    !!quoteDraft?.preview;
  const hasQuotePanel = hasActiveQuoteWorkspace || hasQuoteFiles;

  // Keep source PDF comparison panel open while editing the positions table.
  useEffect(() => {
    if (showDraftTable) setUploadedPdfSidebarOpen(true);
  }, [showDraftTable, setUploadedPdfSidebarOpen]);
  /** Examples only on the home screen — never on /t/:threadSlug. */
  const showExamplePromptsPanel =
    isHome && !showAdminThreadContext && !hasActiveQuoteWorkspace;
  const showThreadContextPanel =
    showAdminThreadContext || (showThreadFiles && !isHome);
  const shouldRenderPanel =
    isHome ||
    showThreadContextPanel ||
    hasQuotePanel ||
    showExamplePromptsPanel;

  // Open examples once when they appear; do NOT re-force open after the user collapses.
  const prevShowExamplesRef = useRef(false);
  useEffect(() => {
    if (showExamplePromptsPanel && !prevShowExamplesRef.current) {
      setDocumentPanelOpen(true);
    }
    prevShowExamplesRef.current = showExamplePromptsPanel;
  }, [showExamplePromptsPanel, setDocumentPanelOpen]);

  useEffect(() => {
    if (isHome) setDocumentPanelOpen(true);
  }, [isHome, setDocumentPanelOpen]);

  useEffect(() => {
    if (hasFilePreview) setDocumentPanelOpen(true);
  }, [hasFilePreview, setDocumentPanelOpen]);

  useEffect(() => {
    if (hasQuoteFiles) setDocumentPanelOpen(true);
  }, [hasQuoteFiles, setDocumentPanelOpen]);

  useEffect(() => {
    preferDialogTabRef.current = false;
  }, [activeThreadSlug, activeWorkspaceSlug]);

  useEffect(() => {
    if (preferDialogTabRef.current) return;
    if (documentPanelView !== "docs") return;
    // Prefer Documents (draft / preview / PDF) over Диалог when quote content exists.
    if (docPreview?.markdown) setDocumentPanelView("doc");
    else if (hasEditableQuoteLines || isMatchingInProgress)
      setDocumentPanelView("draftTable");
    else if (quoteDraft?.preview) setDocumentPanelView("quotePreview");
    else if (quotePdfUrl) setDocumentPanelView("pdf");
    else if (hasQuoteBuilderContent) setDocumentPanelView("builder");
  }, [
    documentPanelView,
    docPreview?.markdown,
    hasEditableQuoteLines,
    isMatchingInProgress,
    quoteDraft?.preview,
    quotePdfUrl,
    hasQuoteBuilderContent,
    setDocumentPanelView,
  ]);

  function panelEyebrow() {
    if (showExamplePromptsPanel) return t("home.examplePrompts.panelLabel");
    if (
      hasFilePreview ||
      hasActiveQuoteWorkspace ||
      hasQuoteFiles ||
      hasEditableQuoteLines ||
      hasQuoteBuilderContent
    ) {
      return t("layout.documentPanel");
    }
    return t("layout.conversationContext");
  }

  function preferredCloseView() {
    if (hasEditableQuoteLines || isMatchingInProgress) return "draftTable";
    if (quoteDraft?.preview) return "quotePreview";
    if (hasQuoteBuilderContent) return "builder";
    return "docs";
  }

  const panelBody = (
    <>
      {!isHome && activeWorkspaceSlug && (
        <div className="px-4 py-2 border-b border-theme-sidebar-border shrink-0">
          <CurrentWorkspaceIndicator
            workspaceSlug={activeWorkspaceSlug}
            variant="compact"
          />
        </div>
      )}

      {hasActiveQuoteWorkspace && (
        <div className="flex flex-wrap border-b border-theme-sidebar-border shrink-0">
          {hasEditableQuoteLines && (
            <button
              type="button"
              onClick={() => {
                preferDialogTabRef.current = false;
                setDocumentPanelView("draftTable");
              }}
              className={`offerKp-doc-tab ${documentPanelView === "draftTable" ? "offerKp-doc-tab--active" : ""}`}
            >
              {t("layout.tabCrossSection")}
            </button>
          )}
          {quoteDraft?.preview && (
            <button
              type="button"
              onClick={() => {
                preferDialogTabRef.current = false;
                setDocumentPanelView("quotePreview");
              }}
              className={`offerKp-doc-tab flex items-center gap-1 ${documentPanelView === "quotePreview" ? "offerKp-doc-tab--active" : ""}`}
            >
              {t("layout.tabPreview", { defaultValue: "Preview" })}
            </button>
          )}
          {showDocPreview && (
            <button
              type="button"
              onClick={() => {
                preferDialogTabRef.current = false;
                setDocumentPanelView("doc");
              }}
              className={`offerKp-doc-tab flex items-center gap-1 ${documentPanelView === "doc" ? "offerKp-doc-tab--active" : ""}`}
            >
              <FileDoc size={13} weight="fill" />
              {t("layout.tabDocument", { defaultValue: "Document" })}
            </button>
          )}
          {quotePdfUrl && (
            <button
              type="button"
              onClick={() => {
                preferDialogTabRef.current = false;
                setDocumentPanelView("pdf");
              }}
              className={`offerKp-doc-tab flex items-center gap-1 ${documentPanelView === "pdf" ? "offerKp-doc-tab--active" : ""}`}
            >
              <FilePdf size={13} weight="fill" />
              PDF
            </button>
          )}
          {showQuoteBuilder && (
            <button
              type="button"
              onClick={() => {
                preferDialogTabRef.current = false;
                setDocumentPanelView("builder");
              }}
              className={`offerKp-doc-tab ${documentPanelView === "builder" ? "offerKp-doc-tab--active" : ""}`}
            >
              {t("layout.tabQuote")}
            </button>
          )}
          {showThreadContextPanel && (
            <button
              type="button"
              onClick={() => {
                preferDialogTabRef.current = true;
                setDocumentPanelView("docs");
              }}
              className={`offerKp-doc-tab ${documentPanelView === "docs" ? "offerKp-doc-tab--active" : ""}`}
            >
              {t("layout.conversationContext")}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        {showDocPreview ? (
          <DocPreviewPane
            docPreview={docPreview}
            onClose={() => {
              setDocPreview(null);
              setDocumentPanelView(preferredCloseView());
            }}
          />
        ) : showPdfPreview && documentPanelView === "pdf" ? (
          <PdfPreviewPane
            quotePdfUrl={quotePdfUrl}
            onClose={() => {
              setQuotePdfUrl(null);
              setDocumentPanelView(preferredCloseView());
            }}
          />
        ) : showDraftTable ? (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            {isMatchingInProgress || matchProgress?.stage === "matched" ? (
              <div className="px-4 py-2.5 border-b border-theme-sidebar-border bg-theme-bg-secondary text-xs text-theme-text-secondary shrink-0">
                {matchProgress?.stage === "parsing"
                  ? t("matchProgress.parsing", {
                      count: matchProgress.lineCount || 0,
                      defaultValue: "Распознано позиций: {{count}}. Сопоставление с каталогом…",
                    })
                  : matchProgress?.stage === "searching"
                    ? t("matchProgress.searching", {
                        current: matchProgress.matchedCount || 0,
                        total: matchProgress.total || 0,
                        defaultValue:
                          "Поиск в ShopDB: строка {{current}} / {{total}}",
                      })
                    : t("matchProgress.matched", {
                        defaultValue: "Сопоставление завершено",
                      })}
              </div>
            ) : null}
            {hasEditableQuoteLines ? (
              <QuoteDraftTable />
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-sm text-theme-text-secondary">
                {t("matchProgress.waitTable", {
                  defaultValue: "Черновик КП появится по мере сопоставления позиций…",
                })}
              </div>
            )}
          </div>
        ) : showQuotePreview ? (
          <QuotePreview />
        ) : showQuoteBuilder && documentPanelView === "builder" ? (
          <div className="flex-1 overflow-y-auto p-4">
            <QuoteStepper />
          </div>
        ) : showExamplePromptsPanel ? (
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-6 min-w-0">
            <ExamplePromptsPanel />
          </div>
        ) : showThreadContextPanel ? (
          <div
            className={`flex-1 min-h-0 flex flex-col gap-0 p-4 ${
              hasEditableQuoteLines || hasQuoteBuilderContent
                ? "overflow-hidden"
                : "overflow-y-auto"
            }`}
          >
            {showAdminThreadContext ? (
              <>
                <OfferKpThreadPanelSection
                  title={t("layout.memory")}
                  value={memory}
                  onSave={persistMemory}
                  placeholder={t("layout.memoryPlaceholder")}
                  showPrivateBadge
                  rows={10}
                />
                <OfferKpThreadPanelSection
                  title={t("layout.instructions")}
                  value={instructions}
                  onSave={persistInstructions}
                  placeholder={t("layout.instructionsPlaceholder")}
                  rows={6}
                />
              </>
            ) : null}
            {showThreadFiles ? (
              <ThreadFilesSection
                workspaceSlug={activeWorkspaceSlug}
                threadSlug={activeThreadSlug}
                onAttach={handleAttach}
                embedPdfPreview={
                  hasEditableQuoteLines || hasQuoteBuilderContent
                }
              />
            ) : null}
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {hasQuoteFiles ? (
          <GeneratedQuotesDock files={threadQuoteFiles} />
        ) : null}
      </div>
    </>
  );

  if (!shouldRenderPanel) return null;

  const isPureThreadContext =
    showThreadContextPanel && !isHome && !hasQuotePanel;

  if (isPureThreadContext) {
    return (
      <div className="offerKp-context-widget fixed bottom-4 right-4 z-40 hidden lg:flex flex-col items-end gap-2">
        {contextWidgetOpen && (
          <div className="offerKp-context-widget__panel flex flex-col w-[360px] max-h-[70vh] rounded-xl border border-theme-sidebar-border bg-theme-bg-chat-input shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-theme-sidebar-border shrink-0">
              <span className="offerKp-document-panel__eyebrow">
                {t("layout.conversationContext")}
              </span>
              <button
                type="button"
                onClick={() => setContextWidgetOpen(false)}
                className="text-theme-text-secondary hover:text-theme-text-primary border-none bg-transparent p-1 cursor-pointer"
                aria-label={t("layout.collapsePanel", { defaultValue: "Collapse" })}
              >
                <X size={16} />
              </button>
            </div>
            {activeWorkspaceSlug && (
              <div className="px-4 py-2 border-b border-theme-sidebar-border shrink-0">
                <CurrentWorkspaceIndicator
                  workspaceSlug={activeWorkspaceSlug}
                  variant="compact"
                />
              </div>
            )}
            <div className="flex-1 overflow-y-auto flex flex-col gap-0 p-4 min-h-0">
              {showAdminThreadContext ? (
                <>
                  <OfferKpThreadPanelSection
                    title={t("layout.memory")}
                    value={memory}
                    onSave={persistMemory}
                    placeholder={t("layout.memoryPlaceholder")}
                    showPrivateBadge
                    rows={10}
                  />
                  <OfferKpThreadPanelSection
                    title={t("layout.instructions")}
                    value={instructions}
                    onSave={persistInstructions}
                    placeholder={t("layout.instructionsPlaceholder")}
                    rows={6}
                  />
                </>
              ) : null}
              {showThreadFiles ? (
                <ThreadFilesSection
                  workspaceSlug={activeWorkspaceSlug}
                  threadSlug={activeThreadSlug}
                  onAttach={handleAttach}
                />
              ) : null}
            </div>
            {hasQuoteFiles ? (
              <GeneratedQuotesDock files={threadQuoteFiles} />
            ) : null}
          </div>
        )}
        <button
          type="button"
          onClick={() => setContextWidgetOpen((prev) => !prev)}
          className="flex items-center gap-2 h-10 px-4 rounded-full border border-theme-sidebar-border bg-theme-bg-chat-input text-theme-text-primary shadow-lg hover:bg-theme-sidebar-item-hover transition-colors"
          aria-expanded={contextWidgetOpen}
          title={t("layout.conversationContext")}
        >
          {contextWidgetOpen ? <X size={16} /> : <NotePencil size={16} />}
          <span className="text-xs font-medium">
            {t("layout.conversationContext")}
          </span>
        </button>
      </div>
    );
  }

  return (
    <aside
      className={`offerKp-document-panel relative hidden lg:flex flex-col shrink-0 h-full transition-[width] duration-300 ease-in-out ${
        documentPanelOpen ? "" : "w-12 items-center"
      }`}
      style={documentPanelOpen ? { width: panelWidth } : undefined}
      aria-label={panelEyebrow()}
    >
      {documentPanelOpen && (
        <div
          className="offerKp-document-panel__resizer"
          onMouseDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          title="Drag to resize"
        />
      )}

      {documentPanelOpen ? (
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-sidebar-border shrink-0 w-full">
          <span className="offerKp-document-panel__eyebrow">{panelEyebrow()}</span>
          <button
            type="button"
            onClick={() => setDocumentPanelOpen(false)}
            className="text-theme-text-secondary hover:text-theme-text-primary border-none bg-transparent p-1 cursor-pointer"
            aria-label={t("layout.collapsePanel", { defaultValue: "Collapse panel" })}
            aria-expanded={true}
            title={t("layout.collapsePanel", { defaultValue: "Collapse panel" })}
          >
            <CaretRight size={18} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDocumentPanelOpen(true)}
          className="text-theme-text-secondary hover:text-theme-text-primary border-none bg-transparent p-2 mt-3 cursor-pointer"
          aria-label={t("layout.expandPanel", { defaultValue: "Expand panel" })}
          aria-expanded={false}
          title={t("layout.expandPanel", { defaultValue: "Expand panel" })}
        >
          <CaretLeft size={18} />
        </button>
      )}

      {documentPanelOpen && (
        <div
          key={documentPanelView}
          className="flex flex-col flex-1 min-h-0 min-w-0 w-full"
        >
          {panelBody}
        </div>
      )}
    </aside>
  );
}
