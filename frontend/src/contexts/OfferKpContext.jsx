import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import OfferKp from "@/models/offerKp";
import { INITIAL_QUOTE_DRAFT } from "@/utils/offerKp/quoteFlow";
import { mergeNotifications } from "@/utils/offerKp/notifications";

const OfferKpContext = createContext(null);

const NOTIFICATIONS_POLL_MS = 20 * 60 * 1000;

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
  const [notifications, setNotifications] = useState([]);
  const [localNotifications, setLocalNotifications] = useState([]);
  const [savedDocuments, setSavedDocuments] = useState(SEED_DOCUMENTS);
  const [savTickets, setSavTickets] = useState([]);
  const [quotePdfUrl, setQuotePdfUrl] = useState(null);
  const [docPreview, setDocPreview] = useState(null);

  const refreshNotifications = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await OfferKp.listNotifications();
      setNotifications(
        mergeNotifications(data.notifications || [], localNotifications)
      );
    } catch (e) {
      if (e.status !== 401) console.error("[offerKp] notifications:", e.message);
    }
  }, [enabled, localNotifications]);

  const addNotification = useCallback((notification) => {
    const entry = {
      id: notification.id || `local-${Date.now()}`,
      read: false,
      at: Date.now(),
      ...notification,
    };
    setLocalNotifications((prev) => [entry, ...prev]);
    setNotifications((prev) => mergeNotifications(prev, [entry]));
  }, []);

  useEffect(() => {
    refreshNotifications();
    if (!enabled) return undefined;
    const timer = setInterval(refreshNotifications, NOTIFICATIONS_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, refreshNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = useCallback(async () => {
    try {
      await OfferKp.markAllNotificationsRead();
      setLocalNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (e) {
      console.error("[offerKp] markAllRead:", e.message);
    }
  }, []);

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
      notifications,
      unreadCount,
      markAllRead,
      addNotification,
      refreshNotifications,
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
      notifications,
      unreadCount,
      markAllRead,
      addNotification,
      refreshNotifications,
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
      notifications: [],
      unreadCount: 0,
      markAllRead: () => {},
      addNotification: () => {},
      refreshNotifications: () => {},
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
