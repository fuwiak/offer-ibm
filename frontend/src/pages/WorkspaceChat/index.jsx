import React, { useEffect } from "react";
import { default as WorkspaceChatContainer } from "@/components/WorkspaceChat";
import Sidebar from "@/components/Sidebar";
import { useOutletContext } from "react-router-dom";
import PasswordModal, { usePasswordModal } from "@/components/Modals/Password";
import { isMobile } from "react-device-detect";
import { FullScreenLoader } from "@/components/Preloader";
import OfferKpLayout from "@/layouts/OfferKpLayout";
import OfferKpProfileShell from "@/components/OfferKp/OfferKpProfileShell";
import { shouldUseOfferKpLayout as shouldUseOfferKpLayout } from "@/utils/offerKp/detectOfferKpMode";
import { useLocation, useNavigate } from "react-router-dom";
import paths from "@/utils/paths";
import { PENDING_HOME_MESSAGE } from "@/utils/constants";
import useWorkspaceThreadChat from "@/hooks/useWorkspaceThreadChat";
import { threadNavLog } from "@/utils/offerKp/threadNavLogger";

/** Full-page shell for /bot and legacy direct workspace URLs. */
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

/** Workspace chat content — renders inside Main layout outlet or standalone shell. */
export function ShowWorkspaceChat() {
  const { embeddedInMain = false } = useOutletContext() ?? {};
  const { slug, threadSlug = null, workspace, history, loading } =
    useWorkspaceThreadChat();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const offerKpMode = shouldUseOfferKpLayout({
    workspaceSlug: workspace?.slug,
    pathname,
  });

  const isWorkspaceRoot =
    !!slug && /^\/workspace\/[^/]+$/.test(pathname) && !threadSlug;
  const hasPendingMessage = !!sessionStorage.getItem(PENDING_HOME_MESSAGE);

  useEffect(() => {
    if (!offerKpMode || !isWorkspaceRoot || hasPendingMessage) return;
    if (loading || history === null) return;
    if (history.length > 0) return;
    threadNavLog("page:redirect-home-empty-workspace", { slug, pathname });
    navigate(paths.home(), { replace: true });
  }, [
    offerKpMode,
    isWorkspaceRoot,
    hasPendingMessage,
    loading,
    history,
    navigate,
    slug,
    pathname,
  ]);

  const chat = (
    <WorkspaceChatContainer
      workspace={workspace}
      history={history}
      loading={loading}
    />
  );

  const chatPanel = embeddedInMain ? (
    <div className="flex flex-1 min-h-0 min-w-0 h-full w-full overflow-hidden">
      {chat}
    </div>
  ) : (
    chat
  );

  if (!offerKpMode) return chatPanel;
  if (embeddedInMain) return chatPanel;

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
