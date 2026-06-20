import React, { useEffect, useState } from "react";
import { default as WorkspaceChatContainer } from "@/components/WorkspaceChat";
import Sidebar from "@/components/Sidebar";
import { useParams } from "react-router-dom";
import Workspace from "@/models/workspace";
import PasswordModal, { usePasswordModal } from "@/components/Modals/Password";
import { isMobile } from "react-device-detect";
import { FullScreenLoader } from "@/components/Preloader";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";
import { SAVE_LLM_SELECTOR_EVENT } from "@/components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector/action";
import OfferKpLayout from "@/layouts/OfferKpLayout";
import OfferKpProfileShell from "@/components/OfferKp/OfferKpProfileShell";
import { shouldUseOfferKpLayout as shouldUseOfferKpLayout } from "@/utils/offerKp/detectOfferKpMode";
import { useLocation, useNavigate } from "react-router-dom";
import paths from "@/utils/paths";
import { PENDING_HOME_MESSAGE } from "@/utils/constants";
import { perfMark, perfMeasure, perfTimed } from "@/utils/perfLogger";
import { threadNavLog } from "@/utils/offerKp/threadNavLogger";

export default function WorkspaceChat() {
  const { loading, requiresAuth, mode } = usePasswordModal();
  const { pathname } = useLocation();

  if (loading) return <FullScreenLoader />;
  if (requiresAuth !== false) {
    return <>{requiresAuth !== null && <PasswordModal mode={mode} />}</>;
  }

  const offerKpBotRoute = pathname.startsWith("/bot");

  if (offerKpBotRoute) {
    return <ShowWorkspaceChat />;
  }

  const offerKpShell = shouldUseOfferKpLayout({ pathname });

  const shell = (
    <>
      {!isMobile && <Sidebar />}
      <div className="flex flex-1 min-w-0 h-full overflow-hidden">
        <ShowWorkspaceChat />
      </div>
    </>
  );

  if (!offerKpShell) {
    return (
      <div className="w-screen h-screen overflow-hidden flex bg-zinc-950 light:bg-slate-50">
        {shell}
      </div>
    );
  }

  return (
    <OfferKpProfileShell className="w-screen h-screen overflow-hidden flex bg-theme-bg-container">
      {shell}
    </OfferKpProfileShell>
  );
}

function ShowWorkspaceChat() {
  const { slug, threadSlug = null } = useParams();
  const { pathname, state: locationState } = useLocation();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState(null);
  const [chatHistory, setChatHistory] = useState(null);
  const historyKey = `${slug ?? ""}:${threadSlug ?? "default"}`;
  const [loadedHistoryKey, setLoadedHistoryKey] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function getWorkspace() {
      if (!slug) return;
      threadNavLog("page:load-start", {
        slug,
        threadSlug,
        historyKey,
        pathname,
      });
      setChatHistory(null);
      setLoadedHistoryKey(null);
      perfMark("workspace-chat:load-start", { slug, threadSlug });
      const wsTimer = perfTimed("workspace-chat:bySlug", { slug });

      const _workspace = await Workspace.bySlug(slug);
      wsTimer.done({ found: !!_workspace });

      if (!_workspace) {
        if (!cancelled) {
          setWorkspace(null);
          setChatHistory([]);
          setLoadedHistoryKey(historyKey);
        }
        perfMark("workspace-chat:missing", { slug });
        return;
      }

      perfMark("workspace-chat:extras-start", { slug });
      const extrasTimer = perfTimed("workspace-chat:extras", { slug });
      const [suggestedMessages, { showAgentCommand }] = await Promise.all([
        Workspace.getSuggestedMessages(slug),
        Workspace.agentCommandAvailable(slug),
      ]);
      extrasTimer.done();

      perfMark("workspace-chat:history-start", { slug, threadSlug });
      const historyTimer = perfTimed("workspace-chat:history", {
        slug,
        threadSlug,
      });
      const history = threadSlug
        ? await Workspace.threads.chatHistory(slug, threadSlug)
        : await Workspace.chatHistory(slug);
      historyTimer.done({ count: history?.length ?? 0 });

      if (!cancelled) {
        setWorkspace({
          ..._workspace,
          suggestedMessages,
          showAgentCommand,
        });
        setChatHistory(history ?? []);
        setLoadedHistoryKey(historyKey);
        threadNavLog("page:load-done", {
          slug,
          threadSlug,
          historyKey,
          historyCount: history?.length ?? 0,
        });
      }
      perfMark("workspace-chat:ready", {
        slug,
        historyCount: history?.length ?? 0,
      });
      perfMeasure(
        "workspace-chat:load-start",
        "workspace-chat:ready",
        "workspace-chat:total"
      );

      localStorage.setItem(
        LAST_VISITED_WORKSPACE,
        JSON.stringify({
          slug: _workspace.slug,
          name: _workspace.name,
        })
      );
    }
    getWorkspace();
    return () => {
      cancelled = true;
    };
  }, [slug, threadSlug, historyKey, pathname, locationState?.openThreadAt]);

  useEffect(() => {
    if (!slug) return undefined;
    async function syncWorkspaceModel() {
      const updated = await Workspace.bySlug(slug);
      if (!updated) return;
      setWorkspace((prev) => (prev ? { ...prev, ...updated } : updated));
    }
    window.addEventListener(SAVE_LLM_SELECTOR_EVENT, syncWorkspaceModel);
    return () =>
      window.removeEventListener(SAVE_LLM_SELECTOR_EVENT, syncWorkspaceModel);
  }, [slug]);

  const offerKpMode = shouldUseOfferKpLayout({
    workspaceSlug: workspace?.slug,
    pathname,
  });

  const isWorkspaceRoot =
    !!slug && /^\/workspace\/[^/]+$/.test(pathname) && !threadSlug;
  const hasPendingMessage = !!sessionStorage.getItem(PENDING_HOME_MESSAGE);

  useEffect(() => {
    if (!offerKpMode || !isWorkspaceRoot || hasPendingMessage) return;
    if (loadedHistoryKey !== historyKey || chatHistory === null) return;
    if (chatHistory.length > 0) return;
    threadNavLog("page:redirect-home-empty-workspace", { slug, pathname });
    navigate(paths.home(), { replace: true });
  }, [
    offerKpMode,
    isWorkspaceRoot,
    hasPendingMessage,
    loadedHistoryKey,
    historyKey,
    chatHistory,
    navigate,
  ]);

  const historyLoading =
    loadedHistoryKey !== historyKey || chatHistory === null;

  const chat = (
    <WorkspaceChatContainer
      loading={historyLoading}
      workspace={workspace}
      initialHistory={historyLoading ? null : chatHistory}
      readyHistoryKey={loadedHistoryKey}
    />
  );

  if (!offerKpMode) return chat;

  return (
    <OfferKpLayout
      enabled={offerKpMode}
      workspaceSlug={slug}
      threadSlug={threadSlug}
    >
      {chat}
    </OfferKpLayout>
  );
}
