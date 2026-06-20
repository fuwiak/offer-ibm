import React, { useState, useEffect, useContext } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { isMobile } from "react-device-detect";
import { SidebarMobileHeader } from "@/components/Sidebar";
import PromptInput, {
  PROMPT_INPUT_EVENT,
  PROMPT_INPUT_ID,
} from "@/components/WorkspaceChat/ChatContainer/PromptInput";
import DnDFileUploaderWrapper, {
  DndUploaderContext,
  DnDFileUploaderProvider,
  PASTE_ATTACHMENT_EVENT,
} from "@/components/WorkspaceChat/ChatContainer/DnDWrapper";
import { useTranslation } from "react-i18next";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";
import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { safeJsonParse } from "@/utils/request";
import QuickActions from "@/components/lib/QuickActions";
import OfferKpQuickActions from "@/components/OfferKp/OfferKpQuickActions";
import SuggestedMessages from "@/components/lib/SuggestedMessages";
import useUser from "@/hooks/useUser";
import { useOfferKp } from "@/contexts/OfferKpContext";
import {
  openQuoteBuilder,
  handleOfferKpQuickActionKey,
} from "@/utils/offerKp/homeActions";
import { resolvePartnerWorkspace } from "@/utils/offerKp/partnerWorkspace";
import { shouldUseOfferKpLayout } from "@/utils/offerKp/detectOfferKpMode";
import { OFFER_KP_NEW_CONVERSATION_EVENT } from "@/utils/offerKp/startNewConversation";
import {
  submitDraftFromHome,
} from "@/utils/offerKp/conversationNav";
import { SAVE_LLM_SELECTOR_EVENT } from "@/components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector/action";
import TextSizeMenu from "@/components/WorkspaceChat/ChatContainer/TextSizeMenu";
import WorkspaceModelPicker from "@/components/WorkspaceChat/ChatContainer/WorkspaceModelPicker";
import { ChatTooltips } from "@/components/WorkspaceChat/ChatContainer/ChatTooltips";
import { FullScreenLoader } from "@/components/Preloader";
import OfferKpHomeThreadHistory from "@/components/OfferKp/OfferKpHomeThreadHistory";
import CurrentWorkspaceIndicator from "@/components/OfferKp/CurrentWorkspaceIndicator";

async function getTargetWorkspace() {
  const lastVisited = safeJsonParse(
    localStorage.getItem(LAST_VISITED_WORKSPACE)
  );
  if (lastVisited?.slug) {
    const workspace = await Workspace.bySlug(lastVisited.slug);
    if (workspace) return workspace;
  }

  const workspaces = await Workspace.all();
  return workspaces.length > 0 ? workspaces[0] : null;
}

async function createDefaultWorkspace(workspaceName = "My Workspace") {
  const { workspace, message: errorMsg } = await Workspace.new({
    name: workspaceName,
  });
  if (!workspace) {
    showToast(errorMsg || "Failed to create workspace", "error");
    return null;
  }
  return workspace;
}

export default function Home() {
  const { t } = useTranslation();
  const { user } = useUser();
  const { pathname, state: locationState } = useLocation();
  const navigate = useNavigate();
  const { setActiveConversation } = useOfferKp();
  const [workspace, setWorkspace] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversationEpoch, setConversationEpoch] = useState(0);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);

  const resetConversation = () => {
    setConversationEpoch((n) => n + 1);
    window.dispatchEvent(
      new CustomEvent(PROMPT_INPUT_EVENT, {
        detail: { messageContent: "", writeMode: "replace" },
      })
    );
  };

  useEffect(() => {
    if (pathname !== "/") return;

    if (searchParams.has("new") || locationState?.newConversation) {
      resetConversation();
      setSearchParams({}, { replace: true });
      if (locationState?.newConversation) {
        navigate(pathname, { replace: true, state: null });
      }
    }

    window.addEventListener(OFFER_KP_NEW_CONVERSATION_EVENT, resetConversation);
    return () => {
      window.removeEventListener(
        OFFER_KP_NEW_CONVERSATION_EVENT,
        resetConversation
      );
    };
  }, [
    pathname,
    searchParams.get("new"),
    locationState?.newConversation,
    navigate,
    setSearchParams,
  ]);

  useEffect(() => {
    setActiveConversation(workspace?.slug ?? null, null);
  }, [workspace?.slug, setActiveConversation]);

  useEffect(() => {
    if (!workspace?.slug) return undefined;
    async function syncWorkspaceModel() {
      const updated = await Workspace.bySlug(workspace.slug);
      if (!updated) return;
      setWorkspace((prev) => (prev ? { ...prev, ...updated } : updated));
    }
    window.addEventListener(SAVE_LLM_SELECTOR_EVENT, syncWorkspaceModel);
    return () =>
      window.removeEventListener(SAVE_LLM_SELECTOR_EVENT, syncWorkspaceModel);
  }, [workspace?.slug]);

  useEffect(() => {
    async function init() {
      const preferredSlug = searchParams.get("space");
      const ws = shouldUseOfferKpLayout({ pathname })
        ? await resolvePartnerWorkspace(
            t("new-workspace.placeholder"),
            preferredSlug
          )
        : await getTargetWorkspace();
      if (ws) {
        const [suggestedMessages, { showAgentCommand }] = await Promise.all([
          Workspace.getSuggestedMessages(ws.slug),
          Workspace.agentCommandAvailable(ws.slug),
        ]);
        setWorkspace({
          ...ws,
          suggestedMessages,
          showAgentCommand,
        });
      }
      setWorkspaceLoading(false);
    }
    init();
  }, [pathname, t, searchParams.get("space")]);

  useEffect(() => {
    async function handlePaste(e) {
      const pasted = e.detail?.files;
      if (!pasted?.length) return;

      let ws = workspace;
      if (!ws) {
        ws = shouldUseOfferKpLayout({ pathname })
          ? await resolvePartnerWorkspace(t("new-workspace.placeholder"))
          : await createDefaultWorkspace(t("new-workspace.placeholder"));
        if (!ws) return;
        setWorkspace(ws);
      }
    }

    window.addEventListener(PASTE_ATTACHMENT_EVENT, handlePaste);
    return () =>
      window.removeEventListener(PASTE_ATTACHMENT_EVENT, handlePaste);
  }, [workspace, pathname, t]);

  if (workspaceLoading) {
    return (
      <div className="flex flex-1 min-w-0 h-full w-full items-center justify-center offerKp-chat-shell offerKp-home-shell bg-theme-bg-primary">
        <FullScreenLoader />
      </div>
    );
  }

  if (!workspace && user?.role === "default") {
    return <NoWorkspacesAssigned />;
  }

  return workspace ? (
    <DnDFileUploaderProvider workspace={workspace} threadSlug={null}>
      <HomeContent
        key={`home-${conversationEpoch}`}
        workspace={workspace}
        setWorkspace={setWorkspace}
      />
    </DnDFileUploaderProvider>
  ) : (
    <HomeContent
      key={`home-${conversationEpoch}`}
      workspace={workspace}
      setWorkspace={setWorkspace}
    />
  );
}

function HomeContent({ workspace, setWorkspace }) {
  const { t } = useTranslation();
  const { t: ta } = useTranslation("offerKp");
  const { pathname } = useLocation();
  const { user } = useUser();
  const greetingName =
    user?.firstName ||
    user?.name?.split?.(" ")?.[0] ||
    user?.username?.split?.(" ")?.[0] ||
    user?.login?.split?.(" ")?.[0] ||
    "there";
  const offerKpMode = shouldUseOfferKpLayout({
    pathname,
    workspaceSlug: workspace?.slug,
  });
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const offerKp = useOfferKp();
  const [loading, setLoading] = useState(false);
  const { files, parseAttachments } = useContext(DndUploaderContext);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(PROMPT_INPUT_EVENT, {
        detail: { messageContent: "", writeMode: "replace" },
      })
    );
  }, []);

  useEffect(() => {
    if (!offerKpMode) return;
    offerKp.setDocumentPanelOpen(true);
    if (searchParams.get("action") !== "quote") return;
    openQuoteBuilder(offerKp);
    setSearchParams({}, { replace: true });
  }, [offerKpMode, searchParams.get("action")]);

  async function submitMessage(message, attachments = []) {
    if (!message || loading) return;
    setLoading(true);
    try {
      let targetWorkspace = workspace;

      if (!targetWorkspace) {
        targetWorkspace = offerKpMode
          ? await resolvePartnerWorkspace(t("new-workspace.placeholder"))
          : await createDefaultWorkspace(t("new-workspace.placeholder"));
        if (!targetWorkspace) {
          setLoading(false);
          return;
        }
        setWorkspace(targetWorkspace);
      }

      const { thread } = await Workspace.threads.new(targetWorkspace.slug);
      if (!thread?.slug) {
        setLoading(false);
        return;
      }

      const parsedFileIds = (files || [])
        .filter((f) => f.document?.id && f.status === "added_context")
        .map((f) => f.document.id);

      if (parsedFileIds.length) {
        await Workspace.assignParsedFilesToThread(
          targetWorkspace.slug,
          thread.slug,
          parsedFileIds
        );
      }

      localStorage.setItem(
        LAST_VISITED_WORKSPACE,
        JSON.stringify({
          slug: targetWorkspace.slug,
          name: targetWorkspace.name,
        })
      );

      if (offerKpMode) {
        submitDraftFromHome(navigate, targetWorkspace.slug, thread.slug, {
          message,
          attachments,
        });
      } else {
        navigate(paths.workspace.thread(targetWorkspace.slug, thread.slug), {
          state: {
            newConversation: true,
            draft: { message, attachments },
          },
        });
      }
    } catch (error) {
      console.error("Error submitting message:", error);
      showToast("Failed to send message", "error");
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const currentMessage =
      document.getElementById(PROMPT_INPUT_ID)?.value?.trim() || "";
    await submitMessage(currentMessage, parseAttachments());
  }

  function sendCommand({
    text = "",
    autoSubmit = false,
    writeMode = "replace",
  }) {
    if (autoSubmit) {
      if (writeMode === "append") {
        const currentText =
          document.getElementById(PROMPT_INPUT_ID)?.value ?? "";
        text = currentText + text;
      }
      if (!text.trim()) return;
      submitMessage(text.trim());
      return;
    }
    window.dispatchEvent(
      new CustomEvent(PROMPT_INPUT_EVENT, {
        detail: { messageContent: text, writeMode },
      })
    );
  }

  async function handleEditWorkspace() {
    let targetWorkspace = workspace;

    if (!targetWorkspace) {
      targetWorkspace = await createDefaultWorkspace(
        t("new-workspace.placeholder")
      );
      if (!targetWorkspace) return;
      setWorkspace(targetWorkspace);
    }

    navigate(paths.workspace.settings.generalAppearance(targetWorkspace.slug));
  }

  function handleOfferKpQuickAction(key) {
    handleOfferKpQuickActionKey(key, { navigate, sendCommand });
  }

  async function handlePromptWorkspaceSelect(ws) {
    if (!ws?.slug || ws.slug === workspace?.slug) return;

    localStorage.setItem(
      LAST_VISITED_WORKSPACE,
      JSON.stringify({ slug: ws.slug, name: ws.name })
    );

    const [suggestedMessages, { showAgentCommand }] = await Promise.all([
      Workspace.getSuggestedMessages(ws.slug),
      Workspace.agentCommandAvailable(ws.slug),
    ]);

    setWorkspace({ ...ws, suggestedMessages, showAgentCommand });
    window.dispatchEvent(
      new CustomEvent(PROMPT_INPUT_EVENT, {
        detail: { messageContent: "", writeMode: "replace" },
      })
    );
  }

  const showOfferKpHome = offerKpMode || pathname === "/";

  return (
    <div
      style={{ height: isMobile ? "100%" : "100%" }}
      className={`transition-all duration-500 relative w-full h-full overflow-hidden flex flex-col flex-1 min-w-0 ${
        offerKpMode
          ? "offerKp-chat-shell offerKp-home-shell"
          : "md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-zinc-900 light:bg-white border-none light:border-solid light:border light:border-theme-modal-border"
      }`}
    >
      {isMobile && <SidebarMobileHeader workspace={workspace} />}
      {showOfferKpHome && (
        <div className="offerKp-space-bar shrink-0">
          <CurrentWorkspaceIndicator
            workspace={workspace}
            workspaceSlug={workspace?.slug}
            variant="bar"
          />
        </div>
      )}
      <TextSizeMenu />
      <WorkspaceModelPicker
        workspaceSlug={workspace?.slug}
        workspace={workspace}
      />
      <DnDFileUploaderWrapper>
        <div
          className={`flex flex-col flex-1 min-h-0 w-full overflow-y-auto ${
            showOfferKpHome
              ? "items-start justify-start px-6 md:px-10 lg:px-14 py-8 md:py-12"
              : "items-center justify-center"
          }`}
        >
          <div
            className={`flex flex-col w-full shrink-0 ${
              showOfferKpHome
                ? "max-w-[920px] items-start"
                : "items-center max-w-[750px] px-4"
            }`}
          >
            {showOfferKpHome ? (
              <h1 className="offerKp-home-greeting">
                {ta("home.greeting", {
                  name: greetingName,
                })}
              </h1>
            ) : (
              <h1 className="text-theme-text-primary text-xl md:text-2xl mb-11 text-center font-normal">
                {t("main-page.greeting")}
              </h1>
            )}
            <PromptInput
              workspace={workspace}
              submit={handleSubmit}
              isStreaming={loading}
              sendCommand={sendCommand}
              attachments={files}
              centered={true}
              workspaceSlug={workspace?.slug}
              threadSlug={null}
              placeholder={
                offerKpMode ? ta("home.inputPlaceholder") : undefined
              }
              offerKpHome={showOfferKpHome}
              onWorkspaceSelect={
                showOfferKpHome ? handlePromptWorkspaceSelect : undefined
              }
            />
            {showOfferKpHome && isMobile && (
              <OfferKpHomeThreadHistory
                workspace={workspace}
                activeThreadSlug={offerKp.activeThreadSlug}
              />
            )}
            {showOfferKpHome ? (
              <OfferKpQuickActions onAction={handleOfferKpQuickAction} />
            ) : (
              <QuickActions
                hasAvailableWorkspace={!!workspace}
                onCreateAgent={() => navigate(paths.settings.agentSkills())}
                onEditWorkspace={handleEditWorkspace}
                onUploadDocument={() =>
                  document.getElementById("dnd-chat-file-uploader")?.click()
                }
              />
            )}
          </div>
          {!showOfferKpHome && (
            <SuggestedMessages
              suggestedMessages={workspace?.suggestedMessages}
              sendCommand={sendCommand}
            />
          )}
        </div>
      </DnDFileUploaderWrapper>
      <ChatTooltips />
    </div>
  );
}

function NoWorkspacesAssigned() {
  const { t } = useTranslation();
  return (
    <div
      style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
      className="transition-all duration-500 relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-zinc-900 light:bg-white w-full h-full overflow-hidden"
    >
      <div className="flex flex-col h-full w-full items-center justify-center">
        <p className="text-white/60 text-sm text-center whitespace-pre-line">
          {t("home.notAssigned")}
        </p>
      </div>
    </div>
  );
}
