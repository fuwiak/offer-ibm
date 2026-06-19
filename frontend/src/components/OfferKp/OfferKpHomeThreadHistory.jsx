import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  MagnifyingGlass,
  PushPin,
  PencilSimple,
  FloppyDisk,
  Trash,
  ArrowCounterClockwise,
  ChatText,
  X,
} from "@phosphor-icons/react";
import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import { resolvePartnerWorkspace } from "@/utils/offerKp/partnerWorkspace";
import { formatRelativeTimeAgo, getThreadPrompts } from "@/utils/offerKp/threadMeta";
import OfferKpThreadPromptsModal from "@/components/OfferKp/OfferKpThreadPromptsModal.jsx";
import { OFFER_KP_NEW_CONVERSATION_EVENT } from "@/utils/offerKp/startNewConversation";
import showToast from "@/utils/toast";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

const DELETE_UNDO_MS = 60 * 60 * 1000; // 1 hour to undo a deletion

export default function OfferKpHomeThreadHistory({
  workspace: workspaceProp = null,
  activeThreadSlug = null,
  variant = "home",
}) {
  const isSidebar = variant === "sidebar";
  const { t, i18n } = useTranslation("offerKp");
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { threadSlug: routeThreadSlug = null } = useParams();
  const [workspace, setWorkspace] = useState(workspaceProp);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(!workspaceProp);
  const [threadsRefreshKey, setThreadsRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [pinnedThreadSlugs, setPinnedThreadSlugs] = useState([]);
  const [renamingSlug, setRenamingSlug] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteThread, setConfirmDeleteThread] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [promptsThread, setPromptsThread] = useState(null);
  const [pendingDeletes, setPendingDeletes] = useState([]);
  const [, setClockTick] = useState(0);
  const deleteTimersRef = useRef({});
  const pinStorageKey = `offerKp_home_pinned_threads_${workspace?.slug || "default"}`;
  const pendingDeleteStorageKey = `offerKp_home_pending_deletes_${workspace?.slug || "default"}`;

  function sortWithPinned(list = [], pinned = []) {
    return [...list].sort((a, b) => {
      const aPinned = pinned.includes(a.slug);
      const bPinned = pinned.includes(b.slug);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      return new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime();
    });
  }

  useEffect(() => {
    if (workspaceProp) {
      setWorkspace(workspaceProp);
      return;
    }
    let cancelled = false;
    resolvePartnerWorkspace().then((ws) => {
      if (!cancelled) setWorkspace(ws);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceProp]);

  useEffect(() => {
    const storedPinned = JSON.parse(window.localStorage.getItem(pinStorageKey) || "[]");
    if (Array.isArray(storedPinned)) setPinnedThreadSlugs(storedPinned);
  }, [pinStorageKey]);

  useEffect(() => {
    function bumpRefresh() {
      setThreadsRefreshKey((n) => n + 1);
    }
    window.addEventListener(OFFER_KP_NEW_CONVERSATION_EVENT, bumpRefresh);
    window.addEventListener("renameThread", bumpRefresh);
    return () => {
      window.removeEventListener(OFFER_KP_NEW_CONVERSATION_EVENT, bumpRefresh);
      window.removeEventListener("renameThread", bumpRefresh);
    };
  }, []);

  useEffect(() => {
    if (!workspace?.slug) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { threads: list } = await Workspace.threads.all(workspace.slug);
      if (!cancelled) {
        setThreads(sortWithPinned(list || [], pinnedThreadSlugs));
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [workspace?.slug, pinnedThreadSlugs, threadsRefreshKey, pathname, routeThreadSlug]);

  useEffect(() => {
    const stored = JSON.parse(
      window.localStorage.getItem(pendingDeleteStorageKey) || "[]"
    );
    const list = Array.isArray(stored) ? stored : [];
    const now = Date.now();
    const active = list.filter((item) => item?.slug && item.deleteAt > now);
    const expired = list.filter((item) => item?.slug && item.deleteAt <= now);
    setPendingDeletes(active);
    active.forEach((item) => scheduleFinalDelete(item.slug, item.deleteAt));
    expired.forEach((item) => finalizeDelete(item.slug));
    return () => {
      Object.values(deleteTimersRef.current).forEach((tid) => clearTimeout(tid));
      deleteTimersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDeleteStorageKey, workspace?.slug]);

  useEffect(() => {
    if (!pendingDeletes.length) return undefined;
    const id = setInterval(() => setClockTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, [pendingDeletes.length]);

  const rootClassName = isSidebar
    ? "offerKp-sidebar-thread-history flex flex-col flex-1 min-h-0 w-full"
    : "offerKp-home-thread-history mt-6 w-full";

  if (loading) {
    return (
      <div className={rootClassName}>
        <Skeleton.default
          height={isSidebar ? 32 : 52}
          count={isSidebar ? 4 : 3}
          className="mb-2"
        />
      </div>
    );
  }

  if (!threads.length && !isSidebar) return null;

  const pendingDeleteSlugs = pendingDeletes.map((item) => item.slug);
  const filteredThreads = threads
    .filter((thread) => !pendingDeleteSlugs.includes(thread.slug))
    .filter((thread) =>
      (thread?.name || "")
        .toLowerCase()
        .includes(searchQuery.trim().toLowerCase())
    );

  function formatUndoTimeLeft(deleteAt) {
    const msLeft = Math.max(0, deleteAt - Date.now());
    const minutes = Math.ceil(msLeft / 60000);
    if (minutes >= 60) return "60 min";
    return `${minutes} min`;
  }

  function togglePin(threadSlug) {
    setPinnedThreadSlugs((prev) => {
      const next = prev.includes(threadSlug)
        ? prev.filter((slug) => slug !== threadSlug)
        : [threadSlug, ...prev];
      window.localStorage.setItem(pinStorageKey, JSON.stringify(next));
      return next;
    });
  }

  async function submitRename(thread) {
    const name = renameValue.trim();
    if (!name) return;
    const { message } = await Workspace.threads.update(workspace.slug, thread.slug, { name });
    if (message) {
      showToast(`Thread could not be updated! ${message}`, "error");
      return;
    }
    setThreads((prev) =>
      prev.map((item) => (item.slug === thread.slug ? { ...item, name } : item))
    );
    setRenamingSlug(null);
    setRenameValue("");
  }

  function persistPendingDeletes(next) {
    window.localStorage.setItem(pendingDeleteStorageKey, JSON.stringify(next));
  }

  async function finalizeDelete(slug) {
    if (deleteTimersRef.current[slug]) {
      clearTimeout(deleteTimersRef.current[slug]);
      delete deleteTimersRef.current[slug];
    }
    if (workspace?.slug) {
      await Workspace.threads.delete(workspace.slug, slug);
    }
    setThreads((prev) => prev.filter((item) => item.slug !== slug));
    setPendingDeletes((prev) => {
      const next = prev.filter((item) => item.slug !== slug);
      persistPendingDeletes(next);
      return next;
    });
  }

  function scheduleFinalDelete(slug, deleteAt) {
    if (deleteTimersRef.current[slug]) clearTimeout(deleteTimersRef.current[slug]);
    const delay = Math.max(0, deleteAt - Date.now());
    deleteTimersRef.current[slug] = setTimeout(() => {
      finalizeDelete(slug);
    }, delay);
  }

  function requestDelete(thread) {
    const deleteAt = Date.now() + DELETE_UNDO_MS;
    setConfirmDeleteThread(null);
    setPendingDeletes((prev) => {
      const next = [
        { slug: thread.slug, name: thread.name || "", deleteAt },
        ...prev.filter((item) => item.slug !== thread.slug),
      ];
      persistPendingDeletes(next);
      return next;
    });
    scheduleFinalDelete(thread.slug, deleteAt);
  }

  function undoDelete(slug) {
    if (deleteTimersRef.current[slug]) {
      clearTimeout(deleteTimersRef.current[slug]);
      delete deleteTimersRef.current[slug];
    }
    setPendingDeletes((prev) => {
      const next = prev.filter((item) => item.slug !== slug);
      persistPendingDeletes(next);
      return next;
    });
  }

  function requestDeleteAll() {
    const deleteAt = Date.now() + DELETE_UNDO_MS;
    const threadsToDelete = threads.filter(
      (thread) => !pendingDeleteSlugs.includes(thread.slug)
    );
    if (!threadsToDelete.length) {
      setConfirmDeleteAll(false);
      return;
    }

    setConfirmDeleteAll(false);
    setPendingDeletes((prev) => {
      const next = [
        ...threadsToDelete.map((thread) => ({
          slug: thread.slug,
          name: thread.name || "",
          deleteAt,
        })),
        ...prev.filter(
          (item) => !threadsToDelete.some((thread) => thread.slug === item.slug)
        ),
      ];
      persistPendingDeletes(next);
      return next;
    });
    threadsToDelete.forEach((thread) => scheduleFinalDelete(thread.slug, deleteAt));

    setPinnedThreadSlugs([]);
    window.localStorage.setItem(pinStorageKey, JSON.stringify([]));

    if (
      activeThreadSlug &&
      threadsToDelete.some((thread) => thread.slug === activeThreadSlug)
    ) {
      navigate(paths.offerKp.chat());
    }
  }

  const deletableThreadCount = threads.filter(
    (thread) => !pendingDeleteSlugs.includes(thread.slug)
  ).length;

  return (
    <nav
      className={rootClassName}
      aria-label={t("home.threadHistory")}
    >
      <div className={`relative mb-2 shrink-0 ${isSidebar ? "px-1" : ""}`}>
        <MagnifyingGlass
          size={14}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-theme-text-secondary"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Find conversation by keyword..."
          className="w-full h-8 pl-7 pr-7 text-xs rounded-md border border-theme-sidebar-border bg-transparent text-theme-text-primary placeholder:text-theme-text-secondary focus:outline-none focus:border-primary-button"
        />
        {!!searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 border-none bg-transparent text-theme-text-secondary hover:text-theme-text-primary"
          >
            <X size={12} />
          </button>
        )}
      </div>
      {deletableThreadCount > 0 && (
        <div className={`mb-2 shrink-0 flex justify-end ${isSidebar ? "px-1" : ""}`}>
          <button
            type="button"
            onClick={() => setConfirmDeleteAll(true)}
            className="flex items-center gap-1 rounded border-none bg-transparent px-1.5 py-0.5 text-xs text-theme-text-secondary hover:text-red-500"
            aria-label={t("home.deleteAllConversations")}
          >
            <Trash size={13} />
            {t("home.deleteAllConversations")}
          </button>
        </div>
      )}
      {pendingDeletes.length > 0 && (
        <ul className="offerKp-home-thread-history__pending mb-2 flex flex-col gap-1">
          {pendingDeletes.map((item) => (
            <li
              key={item.slug}
              className="flex items-center gap-2 rounded-md border border-theme-sidebar-border bg-theme-bg-secondary px-2 py-1.5"
            >
              <span className="flex-1 truncate text-xs text-theme-text-secondary">
                {t("home.deletePendingNoticeTimed", {
                  time: formatUndoTimeLeft(item.deleteAt),
                })}
              </span>
              <button
                type="button"
                onClick={() => undoDelete(item.slug)}
                className="shrink-0 flex items-center gap-1 rounded border-none bg-transparent px-1.5 py-0.5 text-xs text-primary-button hover:underline"
              >
                <ArrowCounterClockwise size={13} />
                {t("home.deleteUndo")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul
        className={`offerKp-home-thread-history__list${
          isSidebar ? " offerKp-sidebar-thread-history__list" : ""
        }`}
      >
        {filteredThreads.map((thread) => {
          const isActive = activeThreadSlug === thread.slug;
          const ago = formatRelativeTimeAgo(
            thread.lastUpdatedAt,
            i18n.language?.split("-")[0] || "en"
          );
          const pinned = pinnedThreadSlugs.includes(thread.slug);
          const hasPrompts =
            workspace?.slug &&
            getThreadPrompts(workspace.slug, thread.slug).length > 0;
          return (
            <li key={thread.slug}>
              <div className={`flex items-center gap-1.5${isSidebar ? " group/thread-row" : ""}`}>
                <button
                  type="button"
                  className={`offerKp-home-thread-history__item flex-1 min-w-0${
                    isActive ? " offerKp-home-thread-history__item--active" : ""
                  }`}
                  onClick={() => {
                    navigate(paths.offerKp.thread(workspace.slug, thread.slug));
                  }}
                >
                  {renamingSlug === thread.slug ? (
                    <span className="flex items-center gap-1 w-full">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename(thread);
                          if (e.key === "Escape") {
                            setRenamingSlug(null);
                            setRenameValue("");
                          }
                        }}
                        className="h-6 px-2 text-xs rounded border border-primary-button bg-transparent text-theme-text-primary"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          submitRename(thread);
                        }}
                        className="border-none bg-transparent p-0"
                      >
                        <FloppyDisk size={13} />
                      </button>
                    </span>
                  ) : (
                    <>
                      <span className="offerKp-home-thread-history__title">
                        {pinned ? "📌 " : ""}
                        {thread.name}
                      </span>
                      {ago && !isSidebar && (
                        <span className="offerKp-home-thread-history__meta">
                          {t("home.lastMessageAgo", { time: ago })}
                        </span>
                      )}
                    </>
                  )}
                </button>
                {!isSidebar && workspace?.name && (
                  <span
                    className="shrink-0 max-w-[72px] truncate rounded px-1.5 py-0.5 text-[10px] leading-tight border border-theme-sidebar-border text-theme-text-secondary bg-transparent opacity-60"
                    title={workspace.name}
                  >
                    {workspace.name}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPromptsThread(thread);
                  }}
                  className={`shrink-0 border-none bg-transparent p-1 ${
                    isSidebar ? "opacity-0 group-hover/thread-row:opacity-100 group-focus-within/thread-row:opacity-100" : ""
                  } ${hasPrompts ? "text-primary-button" : "text-theme-text-secondary hover:text-theme-text-primary"}`}
                  aria-label={t("home.threadPrompts.manage")}
                  title={t("home.threadPrompts.manage")}
                >
                  <ChatText size={14} weight={hasPrompts ? "fill" : "regular"} />
                </button>
                <button
                  type="button"
                  onClick={() => togglePin(thread.slug)}
                  className={`shrink-0 border-none bg-transparent p-1 ${
                    isSidebar ? "opacity-0 group-hover/thread-row:opacity-100 group-focus-within/thread-row:opacity-100" : ""
                  } ${pinned ? "text-primary-button" : "text-theme-text-secondary"}`}
                  aria-label={pinned ? "Unpin conversation" : "Pin conversation"}
                >
                  <PushPin size={14} weight={pinned ? "fill" : "regular"} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRenamingSlug(thread.slug);
                    setRenameValue(thread.name || "");
                  }}
                  className={`shrink-0 border-none bg-transparent p-1 text-theme-text-secondary hover:text-theme-text-primary${
                    isSidebar ? " opacity-0 group-hover/thread-row:opacity-100 group-focus-within/thread-row:opacity-100" : ""
                  }`}
                  aria-label="Rename conversation"
                >
                  <PencilSimple size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteThread(thread)}
                  className={`shrink-0 border-none bg-transparent p-1 text-theme-text-secondary hover:text-red-500${
                    isSidebar ? " opacity-0 group-hover/thread-row:opacity-100 group-focus-within/thread-row:opacity-100" : ""
                  }`}
                  aria-label={t("home.deleteConversation")}
                >
                  <Trash size={14} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {filteredThreads.length === 0 && (
        <p className="text-xs text-theme-text-secondary px-2 py-1">
          No conversations found for this keyword.
        </p>
      )}
      {promptsThread && (
        <OfferKpThreadPromptsModal
          thread={promptsThread}
          workspace={workspace}
          onClose={() => setPromptsThread(null)}
        />
      )}
      {confirmDeleteThread && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmDeleteThread(null)}
        >
          <div
            className="w-full max-w-sm mx-4 rounded-lg border border-theme-sidebar-border bg-theme-bg-secondary p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-theme-text-primary">
              {t("home.deleteConfirmTitle")}
            </h3>
            <p className="mt-1 truncate text-xs text-theme-text-secondary">
              {confirmDeleteThread.name}
            </p>
            <p className="mt-3 text-xs text-theme-text-secondary">
              {t("home.deleteConfirmBody")}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteThread(null)}
                className="rounded-md border border-theme-sidebar-border bg-transparent px-3 py-1.5 text-xs text-theme-text-primary hover:bg-theme-sidebar-item-hover"
              >
                {t("home.deleteConfirmCancel")}
              </button>
              <button
                type="button"
                onClick={() => requestDelete(confirmDeleteThread)}
                className="flex items-center gap-1.5 rounded-md border-none bg-red-500 px-3 py-1.5 text-xs text-white hover:bg-red-600"
              >
                <Trash size={13} />
                {t("home.deleteConfirmConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDeleteAll && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmDeleteAll(false)}
        >
          <div
            className="w-full max-w-sm mx-4 rounded-lg border border-theme-sidebar-border bg-theme-bg-secondary p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-theme-text-primary">
              {t("home.deleteAllConfirmTitle")}
            </h3>
            <p className="mt-1 text-xs text-theme-text-secondary">
              {t("home.deleteAllConfirmCount", { count: deletableThreadCount })}
            </p>
            <p className="mt-3 text-xs text-theme-text-secondary">
              {t("home.deleteAllConfirmBody")}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteAll(false)}
                className="rounded-md border border-theme-sidebar-border bg-transparent px-3 py-1.5 text-xs text-theme-text-primary hover:bg-theme-sidebar-item-hover"
              >
                {t("home.deleteConfirmCancel")}
              </button>
              <button
                type="button"
                onClick={requestDeleteAll}
                className="flex items-center gap-1.5 rounded-md border-none bg-red-500 px-3 py-1.5 text-xs text-white hover:bg-red-600"
              >
                <Trash size={13} />
                {t("home.deleteAllConfirmConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
