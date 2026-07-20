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
import { canShowAdminThreadContextPanel } from "@/utils/offerKp/threadPanelAccess";
import ThreadFileDataPreview, {
  FileExtensionBadge,
  displayName,
} from "@/components/OfferKp/ThreadFileDataPreview";
import GeneratedQuotesDock from "@/components/OfferKp/GeneratedQuotesDock";
import { openUploadedFilePreview } from "@/utils/offerKp/openUploadedPdfPreview";

function fileExtension(filename = "") {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop().toUpperCase() : "FILE";
}

function fileIcon(ext) {
  if (ext === "PDF") return FilePdf;
  if (ext === "HTML" || ext === "HTM") return FileHtml;
  return FileDoc;
}

function ThreadFilesSection({ workspaceSlug, threadSlug, onAttach }) {
  const { t } = useTranslation("offerKp");
  const {
    setUploadedPdfPreview,
    setUploadedPdfSidebarOpen,
    uploadedPdfPreview,
  } = useOfferKp();
  const [files, setFiles] = useState([]);
  const [capacityPct, setCapacityPct] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadFiles = useCallback(async () => {
    if (!workspaceSlug || !threadSlug) {
      setFiles([]);
      setCapacityPct(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await Workspace.getParsedFiles(workspaceSlug, threadSlug);
    setFiles(data?.files || []);
    const window = data?.contextWindow || 0;
    const used = data?.currentContextTokenCount || 0;
    setCapacityPct(
      window > 0 ? Math.min(100, Math.round((used / window) * 100)) : 0
    );
    setLoading(false);
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

  async function handleOpenUploadedPdf(file) {
    if (!file?.isPdf || !workspaceSlug) return;
    try {
      await openUploadedFilePreview({
        workspaceSlug,
        threadSlug,
        file,
        setUploadedPdfPreview,
        setUploadedPdfSidebarOpen,
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
    } catch (e) {
      console.error("[ThreadFilesSection] uploaded PDF preview:", e?.message || e);
    }
  }

  return (
    <section className="offerKp-thread-panel-section offerKp-thread-panel-section--files">
      <div className="offerKp-thread-panel-section__head">
        <h3 className="offerKp-thread-panel-section__title">{t("layout.files")}</h3>
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
                  onClick={() => handleOpenUploadedPdf(file)}
                  disabled={!file.isPdf}
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
      <ThreadFileDataPreview
        files={files}
        workspaceSlug={workspaceSlug}
        threadSlug={threadSlug}
      />
    </section>
  );
}

export default function DocumentPanel() {
  const { t } = useTranslation("offerKp");
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const isOfferKpWorkspaceChat = /^\/workspace\/[^/]+(\/t\/[^/]+)?$/.test(pathname);
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
    activeChatEmpty,
  } = useOfferKp();

  const { role } = useOfferKpRole();
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [memory, setMemory] = useState("");
  const [userMemoryNotes, setUserMemoryNotes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [contextWidgetOpen, setContextWidgetOpen] = useState(false);

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
    showDocPreview;
  const hasQuotePanel = hasActiveQuoteWorkspace || hasQuoteFiles;
  /** Examples only on home / empty thread — never cover an active conversation. */
  const showExamplePromptsPanel =
    (isHome || (isOfferKpWorkspaceChat && activeChatEmpty)) &&
    !showAdminThreadContext &&
    !hasActiveQuoteWorkspace;
  const shouldRenderPanel =
    isHome || showAdminThreadContext || hasQuotePanel || showExamplePromptsPanel;

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
    if (!hasActiveQuoteWorkspace || showAdminThreadContext) return;
    if (documentPanelView === "pdf" && showPdfPreview) return;
    if (documentPanelView === "doc" && showDocPreview) return;
    if (documentPanelView !== "docs") return;
    if (showDocPreview) setDocumentPanelView("doc");
    else if (showDraftTable) setDocumentPanelView("draftTable");
    else if (showQuoteBuilder) setDocumentPanelView("builder");
    else if (showPdfPreview) setDocumentPanelView("pdf");
  }, [
    hasActiveQuoteWorkspace,
    showAdminThreadContext,
    documentPanelView,
    showQuoteBuilder,
    showPdfPreview,
    showDocPreview,
    setDocumentPanelView,
  ]);

  function panelEyebrow() {
    if (showExamplePromptsPanel) return t("home.examplePrompts.panelLabel");
    if (hasFilePreview) return t("layout.documentPanel");
    return t("layout.conversationContext");
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
          {showAdminThreadContext && (
            <button
              type="button"
              onClick={() => setDocumentPanelView("docs")}
              className={`offerKp-doc-tab ${documentPanelView === "docs" ? "offerKp-doc-tab--active" : ""}`}
            >
              {t("layout.conversationContext")}
            </button>
          )}
          {showQuoteBuilder && (
            <button
              type="button"
              onClick={() => setDocumentPanelView("builder")}
              className={`offerKp-doc-tab ${documentPanelView === "builder" ? "offerKp-doc-tab--active" : ""}`}
            >
              {t("layout.tabQuote")}
            </button>
          )}
          {hasEditableQuoteLines && (
            <button
              type="button"
              onClick={() => setDocumentPanelView("draftTable")}
              className={`offerKp-doc-tab ${documentPanelView === "draftTable" ? "offerKp-doc-tab--active" : ""}`}
            >
              {t("layout.tabCrossSection")}
            </button>
          )}
          {quoteDraft?.preview && (
            <button
              type="button"
              onClick={() => setDocumentPanelView("quotePreview")}
              className={`offerKp-doc-tab flex items-center gap-1 ${documentPanelView === "quotePreview" ? "offerKp-doc-tab--active" : ""}`}
            >
              {t("layout.tabPreview", { defaultValue: "Preview" })}
            </button>
          )}
          {showDocPreview && (
            <button
              type="button"
              onClick={() => setDocumentPanelView("doc")}
              className={`offerKp-doc-tab flex items-center gap-1 ${documentPanelView === "doc" ? "offerKp-doc-tab--active" : ""}`}
            >
              <FileDoc size={13} weight="fill" />
              {t("layout.tabDocument", { defaultValue: "Document" })}
            </button>
          )}
          {quotePdfUrl && (
            <button
              type="button"
              onClick={() => setDocumentPanelView("pdf")}
              className={`offerKp-doc-tab flex items-center gap-1 ${documentPanelView === "pdf" ? "offerKp-doc-tab--active" : ""}`}
            >
              <FilePdf size={13} weight="fill" />
              PDF
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
              setDocumentPanelView(
                showAdminThreadContext
                  ? "docs"
                  : quoteDraft?.reference
                    ? "builder"
                    : "docs"
              );
            }}
          />
        ) : showPdfPreview && documentPanelView === "pdf" ? (
          <PdfPreviewPane
            quotePdfUrl={quotePdfUrl}
            onClose={() => {
              setQuotePdfUrl(null);
              setDocumentPanelView(
                showAdminThreadContext
                  ? "docs"
                  : quoteDraft?.reference
                    ? "draftTable"
                    : "docs"
              );
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
        ) : showAdminThreadContext ? (
          <div className="flex-1 overflow-y-auto flex flex-col gap-0 p-4">
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
            <ThreadFilesSection
              workspaceSlug={activeWorkspaceSlug}
              threadSlug={activeThreadSlug}
              onAttach={handleAttach}
            />
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

  const isPureAdminContext =
    showAdminThreadContext && !isHome && !hasQuotePanel;

  if (isPureAdminContext) {
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
              <ThreadFilesSection
                workspaceSlug={activeWorkspaceSlug}
                threadSlug={activeThreadSlug}
                onAttach={handleAttach}
              />
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
