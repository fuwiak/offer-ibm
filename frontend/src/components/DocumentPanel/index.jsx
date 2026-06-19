import { useTranslation } from "react-i18next";
import { useOfferKp } from "@/contexts/OfferKpContext";
import {
  X,
  Plus,
  FilePdf,
  FileDoc,
  FileHtml,
  DownloadSimple,
  CaretLeft,
  CaretRight,
  NotePencil,
} from "@phosphor-icons/react";
import { saveAs } from "file-saver";
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
import CurrentWorkspaceIndicator from "@/components/OfferKp/CurrentWorkspaceIndicator";
import useOfferKpRole from "@/hooks/useOfferKpRole";
import { canShowAdminThreadContextPanel } from "@/utils/offerKp/threadPanelAccess";
import ThreadFileDataPreview, {
  FileExtensionBadge,
  displayName,
} from "@/components/OfferKp/ThreadFileDataPreview";

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

  const showQuoteBuilder = documentPanelView === "builder";
  const showDraftTable =
    documentPanelView === "draftTable" &&
    (quoteDraft?.hardwareLines?.length > 0 || quoteDraft?.preview?.lines?.length > 0);
  const showPdfPreview = documentPanelView === "pdf" && quotePdfUrl;
  const showQuotePreview =
    documentPanelView === "quotePreview" && !!quoteDraft?.preview;
  const showDocPreview = documentPanelView === "doc" && !!docPreview?.markdown;
  const hasFilePreview = showPdfPreview || showDocPreview;
  const hasQuotePanel =
    showQuoteBuilder ||
    showDraftTable ||
    showPdfPreview ||
    showQuotePreview ||
    showDocPreview;
  const showExamplePromptsPanel =
    (isHome || isOfferKpWorkspaceChat) &&
    !showAdminThreadContext &&
    !hasQuotePanel;
  const shouldRenderPanel =
    isHome || showAdminThreadContext || hasQuotePanel || showExamplePromptsPanel;

  useEffect(() => {
    if (isHome || showExamplePromptsPanel) setDocumentPanelOpen(true);
  }, [isHome, showExamplePromptsPanel, setDocumentPanelOpen]);

  useEffect(() => {
    if (hasFilePreview) setDocumentPanelOpen(true);
  }, [hasFilePreview, setDocumentPanelOpen]);

  useEffect(() => {
    if (!hasQuotePanel || showAdminThreadContext) return;
    if (documentPanelView === "pdf" && showPdfPreview) return;
    if (documentPanelView === "doc" && showDocPreview) return;
    if (documentPanelView !== "docs") return;
    if (showDocPreview) setDocumentPanelView("doc");
    else if (showDraftTable) setDocumentPanelView("draftTable");
    else if (showQuoteBuilder) setDocumentPanelView("builder");
    else if (showPdfPreview) setDocumentPanelView("pdf");
  }, [
    hasQuotePanel,
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

      {hasQuotePanel && (
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
          {quoteDraft?.hardwareLines?.length > 0 && (
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
                  ? "builder"
                  : "docs"
            );
          }}
        />
      ) : showDraftTable ? (
        <QuoteDraftTable />
      ) : showQuotePreview ? (
        <QuotePreview />
      ) : showQuoteBuilder && documentPanelView === "builder" ? (
        <div className="flex-1 overflow-y-auto p-4">
          <QuoteStepper />
        </div>
      ) : showExamplePromptsPanel ? (
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 min-w-0">
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
      ) : null}
    </>
  );

  if (!shouldRenderPanel) return null;

  const isPureAdminContext =
    showAdminThreadContext && !isHome && !hasQuotePanel;

  if (isPureAdminContext) {
    return (
      <div className="offerKp-context-widget fixed bottom-4 right-4 z-40 hidden xl:flex flex-col items-end gap-2">
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
      className={`offerKp-document-panel relative hidden xl:flex flex-col shrink-0 h-full transition-[width] duration-300 ease-in-out ${
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
        <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full">{panelBody}</div>
      )}
    </aside>
  );
}

function PdfPreviewPane({ quotePdfUrl, onClose }) {
  const { t } = useTranslation("offerKp");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (exporting || !quotePdfUrl?.url) return;
    setExporting(true);
    try {
      const res = await fetch(quotePdfUrl.url);
      const blob = await res.blob();
      saveAs(blob, quotePdfUrl.filename || "document.pdf");
    } catch {
      console.error("Export failed");
    } finally {
      setExporting(false);
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
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <DownloadSimple size={13} weight="bold" />
            {exporting ? "…" : t("layout.downloadPdf")}
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

      <iframe
        src={quotePdfUrl?.url}
        title="PDF Preview"
        className="flex-1 w-full border-0 bg-white"
        style={{ minHeight: 0 }}
      />

      <div className="flex items-center gap-2 px-3 py-2.5 shrink-0 border-t border-theme-sidebar-border bg-theme-bg-secondary">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary-button hover:opacity-90 text-white text-xs font-medium transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <DownloadSimple size={14} weight="bold" />
          {exporting ? "…" : t("layout.downloadPdf")}
        </button>
      </div>
    </div>
  );
}
