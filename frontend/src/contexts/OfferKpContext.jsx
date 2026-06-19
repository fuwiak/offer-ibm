import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { INITIAL_QUOTE_DRAFT } from "@/utils/offerKp/quoteFlow";
import { OFFER_KP_QUOTE_PANEL_EVENT } from "@/utils/offerKp/quotePanelEvents";

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

export function OfferKpProvider({ children, enabled = false, role = "public" }) {
  const [documentPreview, setDocumentPreview] = useState(null);
  const [activeDocumentTab, setActiveDocumentTab] = useState("quote");
  const [quoteDraft, setQuoteDraft] = useState(INITIAL_QUOTE_DRAFT);
  const [documentPanelOpen, setDocumentPanelOpen] = useState(true);
  const [documentPanelView, setDocumentPanelView] = useState("docs");
  const [activeWorkspaceSlug, setActiveWorkspaceSlug] = useState(null);
  const [activeThreadSlug, setActiveThreadSlug] = useState(null);
  const [savedDocuments, setSavedDocuments] = useState(SEED_DOCUMENTS);
  const [savTickets, setSavTickets] = useState([]);
  const [quotePdfUrl, setQuotePdfUrl] = useState(null);
  const [docPreview, setDocPreview] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const onQuotePanel = (e) => {
      const { quoteDraft: draft, documentPanelView: view } = e.detail || {};
      if (draft) setQuoteDraft((prev) => ({ ...prev, ...draft }));
      if (view) setDocumentPanelView(view);
      setDocumentPanelOpen(true);
    };
    window.addEventListener(OFFER_KP_QUOTE_PANEL_EVENT, onQuotePanel);
    return () =>
      window.removeEventListener(OFFER_KP_QUOTE_PANEL_EVENT, onQuotePanel);
  }, [enabled]);

  const addSavTicket = useCallback((ticket) => {
    setSavTickets((prev) => [{ id: Date.now(), status: "open", at: Date.now(), ...ticket }, ...prev]);
  }, []);

  const addSavedDocument = useCallback((doc) => {
    setSavedDocuments((prev) => [{ id: Date.now(), createdAt: Date.now(), ...doc }, ...prev]);
  }, []);

  const setActiveConversation = useCallback((workspaceSlug, threadSlug) => {
    setActiveWorkspaceSlug(workspaceSlug);
    setActiveThreadSlug(threadSlug);
  }, []);

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
      docPreview,
      setDocPreview,
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
      docPreview,
      setDocPreview,
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
      docPreview: null,
      setDocPreview: () => {},
    }
  );
}

export default OfferKpContext;
