import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { INITIAL_QUOTE_DRAFT } from "@/utils/offerKp/quoteFlow";
import { OFFER_KP_QUOTE_PANEL_EVENT } from "@/utils/offerKp/quotePanelEvents";
import { OFFER_KP_QUOTE_FILES_EVENT } from "@/utils/offerKp/quoteFileEvents";
import { mergeQuoteFiles } from "@/utils/offerKp/quoteFileDownload";
import { revokeBlobUrl } from "@/utils/offerKp/openQuoteFilePreview";
import {
  loadQuoteDraft,
  saveQuoteDraft,
} from "@/utils/offerKp/quoteDraftStorage";

const OfferKpContext = createContext(null);

const SEED_DOCUMENTS = [
  {
    id: "q-av-2024-031",
    filename: "Quote_AV-2024-031.pdf",
    type: "quote",
    createdAt: Date.now() - 2 * 3600e3,
    sizeKb: 215,
    hasXls: true,
    hasPreview: true,
  },
  {
    id: "spec-v2",
    filename: "Technical_Spec_V2.pdf",
    type: "spec",
    createdAt: Date.now() - 5 * 86400e3,
    sizeKb: 4301,
    hasXls: false,
    hasPreview: false,
  },
];

export function OfferKpProvider({
  children,
  enabled = false,
  role = "public",
}) {
  const [documentPreview, setDocumentPreview] = useState(null);
  const [activeDocumentTab, setActiveDocumentTab] = useState("quote");
  const [quoteDraft, setQuoteDraft] = useState(INITIAL_QUOTE_DRAFT);
  const [documentPanelOpen, setDocumentPanelOpen] = useState(true);
  const [documentPanelView, setDocumentPanelView] = useState("docs");
  const [activeWorkspaceSlug, setActiveWorkspaceSlug] = useState(null);
  const [activeThreadSlug, setActiveThreadSlug] = useState(null);
  const [savedDocuments, setSavedDocuments] = useState(SEED_DOCUMENTS);
  const [savTickets, setSavTickets] = useState([]);
  const [quotePdfUrl, setQuotePdfUrlState] = useState(null);
  const quotePdfBlobRef = useRef(null);
  const [uploadedPdfPreview, setUploadedPdfPreviewState] = useState(null);
  const uploadedPdfBlobRef = useRef(null);
  const [uploadedPdfSidebarOpen, setUploadedPdfSidebarOpen] = useState(false);

  const setQuotePdfUrl = useCallback((next) => {
    if (quotePdfBlobRef.current && quotePdfBlobRef.current !== next?.url) {
      revokeBlobUrl(quotePdfBlobRef.current);
    }
    quotePdfBlobRef.current = next?.url?.startsWith("blob:") ? next.url : null;
    setQuotePdfUrlState(next);
  }, []);

  const setUploadedPdfPreview = useCallback((next) => {
    if (
      uploadedPdfBlobRef.current &&
      uploadedPdfBlobRef.current !== next?.url
    ) {
      revokeBlobUrl(uploadedPdfBlobRef.current);
    }
    uploadedPdfBlobRef.current = next?.url?.startsWith("blob:")
      ? next.url
      : null;
    setUploadedPdfPreviewState(next);
  }, []);

  useEffect(
    () => () => {
      revokeBlobUrl(quotePdfBlobRef.current);
      revokeBlobUrl(uploadedPdfBlobRef.current);
    },
    []
  );

  const [docPreview, setDocPreview] = useState(null);
  const [threadQuoteFiles, setThreadQuoteFiles] = useState([]);
  const [matchProgress, setMatchProgress] = useState(null);
  /** True when the active thread has no chat messages (or unknown / home). */
  const [activeChatEmpty, setActiveChatEmpty] = useState(true);
  const quoteDraftRef = useRef(quoteDraft);
  const activeWorkspaceRef = useRef(activeWorkspaceSlug);
  const activeThreadRef = useRef(activeThreadSlug);

  useEffect(() => {
    quoteDraftRef.current = quoteDraft;
  }, [quoteDraft]);

  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspaceSlug;
    activeThreadRef.current = activeThreadSlug;
  }, [activeWorkspaceSlug, activeThreadSlug]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onQuotePanel = (e) => {
      const {
        quoteDraft: draft,
        documentPanelView: view,
        progressStage,
        matchedCount,
        total,
        lineCount,
      } = e.detail || {};
      if (draft) setQuoteDraft((prev) => ({ ...prev, ...draft }));
      if (view) setDocumentPanelView(view);
      if (progressStage) {
        setMatchProgress({
          stage: progressStage,
          matchedCount: matchedCount ?? 0,
          total: total ?? lineCount ?? 0,
          lineCount: lineCount ?? total ?? 0,
        });
        if (progressStage === "matched") {
          // Keep banner briefly then clear so table takes focus.
          setTimeout(() => {
            setMatchProgress((prev) =>
              prev?.stage === "matched" ? null : prev
            );
          }, 1200);
        }
      }
      setDocumentPanelOpen(true);
    };
    const onQuoteFiles = (e) => {
      const incoming = e.detail?.files || [];
      if (!incoming.length) return;
      setThreadQuoteFiles((prev) => mergeQuoteFiles(prev, incoming));
    };
    window.addEventListener(OFFER_KP_QUOTE_PANEL_EVENT, onQuotePanel);
    window.addEventListener(OFFER_KP_QUOTE_FILES_EVENT, onQuoteFiles);
    return () => {
      window.removeEventListener(OFFER_KP_QUOTE_PANEL_EVENT, onQuotePanel);
      window.removeEventListener(OFFER_KP_QUOTE_FILES_EVENT, onQuoteFiles);
    };
  }, [enabled]);

  const syncThreadQuoteFiles = useCallback((files = []) => {
    setThreadQuoteFiles(mergeQuoteFiles([], files));
  }, []);

  const addSavTicket = useCallback((ticket) => {
    setSavTickets((prev) => [
      { id: Date.now(), status: "open", at: Date.now(), ...ticket },
      ...prev,
    ]);
  }, []);

  const addSavedDocument = useCallback((doc) => {
    setSavedDocuments((prev) => [
      { id: Date.now(), createdAt: Date.now(), ...doc },
      ...prev,
    ]);
  }, []);

  const setActiveConversation = useCallback(
    (workspaceSlug, threadSlug) => {
      const prevWs = activeWorkspaceRef.current;
      const prevThread = activeThreadRef.current;
      if (prevWs && prevThread) {
        saveQuoteDraft(prevWs, prevThread, quoteDraftRef.current);
      }
      let nextView = "docs";
      if (workspaceSlug && threadSlug) {
        const draft = loadQuoteDraft(workspaceSlug, threadSlug);
        setQuoteDraft(draft);
        const hasLines =
          (draft?.hardwareLines?.length ?? 0) > 0 ||
          (draft?.preview?.lines?.length ?? 0) > 0;
        if (hasLines) nextView = "draftTable";
        else if (draft?.preview) nextView = "quotePreview";
      } else {
        setQuoteDraft(INITIAL_QUOTE_DRAFT);
      }
      // Drop thread-scoped panel UI so empty chats shift back to example prompts
      // instead of keeping the previous thread's PDF/DOC/builder view open.
      if (prevThread !== threadSlug || prevWs !== workspaceSlug) {
        setThreadQuoteFiles([]);
        setUploadedPdfPreview(null);
        setQuotePdfUrl(null);
        setDocPreview(null);
        setDocumentPanelView(nextView);
        setMatchProgress(null);
        // Optimistic empty until ChatContainer reports loaded history.
        setActiveChatEmpty(true);
      }
      setActiveWorkspaceSlug(workspaceSlug);
      setActiveThreadSlug(threadSlug);
    },
    [setQuotePdfUrl, setUploadedPdfPreview]
  );

  useEffect(() => {
    if (!activeWorkspaceSlug || !activeThreadSlug) return;
    saveQuoteDraft(activeWorkspaceSlug, activeThreadSlug, quoteDraft);
  }, [activeWorkspaceSlug, activeThreadSlug, quoteDraft]);

  const value = useMemo(
    () => ({
      enabled,
      role,
      documentPreview,
      setDocumentPreview,
      activeDocumentTab,
      setActiveDocumentTab,
      quoteDraft,
      setQuoteDraft,
      documentPanelOpen,
      setDocumentPanelOpen,
      documentPanelView,
      setDocumentPanelView,
      activeWorkspaceSlug,
      activeThreadSlug,
      setActiveConversation,
      savedDocuments,
      addSavedDocument,
      savTickets,
      addSavTicket,
      quotePdfUrl,
      setQuotePdfUrl,
      uploadedPdfPreview,
      setUploadedPdfPreview,
      uploadedPdfSidebarOpen,
      setUploadedPdfSidebarOpen,
      docPreview,
      setDocPreview,
      threadQuoteFiles,
      syncThreadQuoteFiles,
      matchProgress,
      activeChatEmpty,
      setActiveChatEmpty,
    }),
    [
      enabled,
      role,
      documentPreview,
      activeDocumentTab,
      quoteDraft,
      documentPanelOpen,
      documentPanelView,
      activeWorkspaceSlug,
      activeThreadSlug,
      setActiveConversation,
      savedDocuments,
      addSavedDocument,
      savTickets,
      addSavTicket,
      quotePdfUrl,
      setQuotePdfUrl,
      uploadedPdfPreview,
      setUploadedPdfPreview,
      uploadedPdfSidebarOpen,
      setUploadedPdfSidebarOpen,
      docPreview,
      setDocPreview,
      threadQuoteFiles,
      syncThreadQuoteFiles,
      matchProgress,
      activeChatEmpty,
    ]
  );

  return (
    <OfferKpContext.Provider value={value}>{children}</OfferKpContext.Provider>
  );
}

export function useOfferKp() {
  const ctx = useContext(OfferKpContext);
  return (
    ctx ?? {
      enabled: false,
      role: "public",
      documentPreview: null,
      setDocumentPreview: () => {},
      activeDocumentTab: "quote",
      setActiveDocumentTab: () => {},
      quoteDraft: INITIAL_QUOTE_DRAFT,
      setQuoteDraft: () => {},
      documentPanelOpen: false,
      setDocumentPanelOpen: () => {},
      documentPanelView: "docs",
      setDocumentPanelView: () => {},
      activeWorkspaceSlug: null,
      activeThreadSlug: null,
      setActiveConversation: () => {},
      savedDocuments: [],
      addSavedDocument: () => {},
      savTickets: [],
      addSavTicket: () => {},
      quotePdfUrl: null,
      setQuotePdfUrl: () => {},
      uploadedPdfPreview: null,
      setUploadedPdfPreview: () => {},
      uploadedPdfSidebarOpen: false,
      setUploadedPdfSidebarOpen: () => {},
      docPreview: null,
      setDocPreview: () => {},
      threadQuoteFiles: [],
      syncThreadQuoteFiles: () => {},
      matchProgress: null,
      activeChatEmpty: true,
      setActiveChatEmpty: () => {},
    }
  );
}

export default OfferKpContext;
