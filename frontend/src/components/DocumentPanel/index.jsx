import { useTranslation } from "react-i18next";
import { useOfferKp } from "@/contexts/OfferKpContext";
import { X, Plus, FilePdf, FileDoc, FileHtml, DownloadSimple } from "@phosphor-icons/react";
import { saveAs } from "file-saver";
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import Workspace from "@/models/workspace";
import { safeJsonParse } from "@/utils/request";
import { getThreadMeta, setThreadMeta } from "@/utils/offerKp/threadMeta";
import { extractUserMemoryNotes } from "@/utils/offerKp/leadsInboxContext";
import OfferKpThreadPanelSection from "@/components/OfferKp/OfferKpThreadPanelSection";
import ExamplePromptsPanel from "@/components/OfferKp/ExamplePromptsPanel";
import QuoteStepper from "@/components/OfferKp/QuoteStepper";
import QuotePreview from "@/components/OfferKp/QuotePreview";
import DocPreviewPane from "@/components/OfferKp/DocPreviewPane";
import CurrentWorkspaceIndicator from "@/components/OfferKp/CurrentWorkspaceIndicator";
import useOfferKpRole from "@/hooks/useOfferKpRole";
import { canShowAdminThreadContextPanel } from "@/utils/offerKp/threadPanelAccess";

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
            const meta = safeJsonParse(file.metadata, {});
            const ext = fileExtension(file.filename);
            const Icon = fileIcon(ext);
            const lines = meta?.lines ?? meta?.lineCount;
            return (
              <li key={file.id} className="offerKp-thread-files__card">
                <Icon
                  size={22}
                  weight="duotone"
                  className="offerKp-thread-files__card-icon"
                />
                <span className="offerKp-thread-files__card-name">
                  {file.filename}
                </span>
                {lines != null && (
                  <span className="offerKp-thread-files__card-meta">
                    {t("layout.fileLines", { count: lines })}
                  </span>
                )}
                <span className="offerKp-thread-files__card-type">{ext}</span>
              </li>
            );
          })}
        </ul>
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
  } = useOfferKp();

  const { role } = useOfferKpRole();
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [memory, setMemory] = useState("");
  const [userMemoryNotes, setUserMemoryNotes] = useState("");
  const [instructions, setInstructions] = useState("");

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
    if (isHome) setDocumentPanelOpen(true);
  }, [isHome, setDocumentPanelOpen]);

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
  const showPdfPreview = documentPanelView === "pdf" && quotePdfUrl;
  const showQuotePreview =
    documentPanelView === "quotePreview" && !!quoteDraft?.preview;
  const showDocPreview = documentPanelView === "doc" && !!docPreview?.markdown;
  const hasQuotePanel =
    showQuoteBuilder || showPdfPreview || showQuotePreview || showDocPreview;
  const shouldRenderPanel = isHome || showAdminThreadContext || hasQuotePanel;

  useEffect(() => {
    if (!hasQuotePanel || showAdminThreadContext) return;
    if (documentPanelView === "pdf" && showPdfPreview) return;
    if (documentPanelView !== "docs") return;
    setDocumentPanelView(showQuoteBuilder ? "builder" : "pdf");
  }, [
    hasQuotePanel,
    showAdminThreadContext,
    documentPanelView,
    showQuoteBuilder,
    showPdfPreview,
    setDocumentPanelView,
  ]);

  if (!shouldRenderPanel) return null;

  if (!documentPanelOpen) {
    return (
      <button
        type="button"
        onClick={() => setDocumentPanelOpen(true)}
        className="offerKp-doc-panel-reopen hidden xl:flex"
        aria-label={t("layout.conversationContext")}
      >
        {t("layout.conversationContext")}
      </button>
    );
  }

  return (
    <aside
      className="offerKp-document-panel hidden xl:flex flex-col w-[340px] shrink-0 h-full"
      aria-label={t("layout.conversationContext")}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-sidebar-border shrink-0">
        <span className="offerKp-document-panel__eyebrow">
          {isHome
            ? t("home.examplePrompts.panelLabel")
            : t("layout.conversationContext")}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDocumentPanelOpen(false)}
            className="text-theme-text-secondary hover:text-theme-text-primary border-none bg-transparent p-1 cursor-pointer"
            aria-label="Close panel"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {!isHome && activeWorkspaceSlug && (
        <div className="px-4 py-2 border-b border-theme-sidebar-border shrink-0">
          <CurrentWorkspaceIndicator
            workspaceSlug={activeWorkspaceSlug}
            variant="compact"
          />
        </div>
      )}

      {(showQuoteBuilder || showPdfPreview || showQuotePreview) && (
        <div className="flex border-b border-theme-sidebar-border shrink-0">
          {showAdminThreadContext && (
            <button
              type="button"
              onClick={() => setDocumentPanelView("docs")}
              className={`offerKp-doc-tab ${documentPanelView === "docs" ? "offerKp-doc-tab--active" : ""}`}
            >
              {t("layout.conversationContext")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDocumentPanelView("builder")}
            className={`offerKp-doc-tab ${documentPanelView === "builder" ? "offerKp-doc-tab--active" : ""}`}
          >
            {t("layout.tabQuote")}
          </button>
          {quoteDraft?.preview && (
            <button
              type="button"
              onClick={() => setDocumentPanelView("quotePreview")}
              className={`offerKp-doc-tab flex items-center gap-1 ${documentPanelView === "quotePreview" ? "offerKp-doc-tab--active" : ""}`}
            >
              {t("layout.tabPreview", { defaultValue: "Preview" })}
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
              showAdminThreadContext ? "docs" : quoteDraft?.reference ? "builder" : "docs"
            );
          }}
        />
      ) : showPdfPreview && documentPanelView === "pdf" ? (
        <PdfPreviewPane
          quotePdfUrl={quotePdfUrl}
          onClose={() => {
            setQuotePdfUrl(null);
            setDocumentPanelView(
              showAdminThreadContext ? "docs" : quoteDraft?.reference ? "builder" : "docs"
            );
          }}
        />
      ) : showQuotePreview ? (
        <QuotePreview />
      ) : showQuoteBuilder && documentPanelView === "builder" ? (
        <div className="flex-1 overflow-y-auto p-4">
          <QuoteStepper />
        </div>
      ) : isHome ? (
        <div className="flex-1 overflow-y-auto p-4">
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
    </aside>
  );
}

function PdfPreviewPane({ quotePdfUrl, onClose }) {
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
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b border-theme-sidebar-border bg-theme-bg-secondary gap-2">
        <span
          className="text-xs text-theme-text-secondary truncate min-w-0"
          title={quotePdfUrl?.filename}
        >
          {quotePdfUrl?.filename || "document.pdf"}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Export as PDF button */}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <DownloadSimple size={13} weight="bold" />
            {exporting ? "Exporting…" : "Export as PDF"}
          </button>
          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="text-theme-text-secondary hover:text-theme-text-primary p-0.5 rounded"
            title="Close preview"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* PDF iframe */}
      <iframe
        src={quotePdfUrl?.url}
        title="PDF Preview"
        className="flex-1 w-full border-0 bg-white"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
