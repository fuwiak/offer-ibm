import { useState, useEffect, useContext, useRef } from "react";
import ChatHistory from "./ChatHistory";
import { CLEAR_ATTACHMENTS_EVENT, DndUploaderContext } from "./DnDWrapper";
import PromptInput, {
  PROMPT_INPUT_EVENT,
  PROMPT_INPUT_ID,
} from "./PromptInput";
import Workspace from "@/models/workspace";
import handleChat, { ABORT_STREAM_EVENT } from "@/utils/chat";
import { isMobile } from "react-device-detect";
import { SidebarMobileHeader } from "../../Sidebar";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { v4 } from "uuid";
import handleSocketResponse, {
  websocketURI,
  AGENT_SESSION_END,
  AGENT_SESSION_START,
  setAgentSessionActive,
} from "@/utils/chat/agent";
import DnDFileUploaderWrapper from "./DnDWrapper";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { ChatTooltips } from "./ChatTooltips";
import { MetricsProvider } from "./ChatHistory/HistoricalMessage/Actions/RenderMetrics";
import useChatContainerQuickScroll from "@/hooks/useChatContainerQuickScroll";
import { PENDING_HOME_MESSAGE } from "@/utils/constants";
import { clearPromptInputDraft } from "@/hooks/usePromptInputStorage";
import { safeJsonParse } from "@/utils/request";
import { useTranslation } from "react-i18next";
import paths from "@/utils/paths";
import QuickActions from "@/components/lib/QuickActions";
import OfferKpQuickActions from "@/components/OfferKp/OfferKpQuickActions";
import SuggestedMessages from "@/components/lib/SuggestedMessages";
import { shouldUseOfferKpLayout } from "@/utils/offerKp/detectOfferKpMode";
import { getThreadMeta } from "@/utils/offerKp/threadMeta";
import { extractUserMemoryNotes } from "@/utils/offerKp/leadsInboxContext";
import { handleOfferKpQuickActionKey } from "@/utils/offerKp/homeActions";
import { useOfferKp } from "@/contexts/OfferKpContext";
import useUser from "@/hooks/useUser";
import TextSizeMenu from "./TextSizeMenu";
import WorkspaceModelPicker from "./WorkspaceModelPicker";
import CurrentWorkspaceIndicator from "@/components/OfferKp/CurrentWorkspaceIndicator";
import { switchToWorkspace } from "@/utils/offerKp/switchWorkspace";
import { threadNameFromPrompt } from "@/utils/offerKp/threadNameFromPrompt";
import { THREAD_RENAME_EVENT } from "@/components/Sidebar/ActiveWorkspaces/ThreadContainer";
import SourcesSidebar, { SourcesSidebarProvider } from "./SourcesSidebar";

export default function ChatContainer({
  workspace,
  threadSlug = null,
  knownHistory = [],
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { threadSlug: routeThreadSlug = null } = useParams();
  const activeThreadSlug = threadSlug ?? routeThreadSlug;
  const { t } = useTranslation();
  const { t: ta } = useTranslation("offerKp");
  const { user } = useUser();
  const greetingName =
    user?.firstName ||
    user?.name?.split?.(" ")?.[0] ||
    user?.username?.split?.(" ")?.[0] ||
    user?.login?.split?.(" ")?.[0] ||
    "there";
  const offerKp = useOfferKp();
  const offerKpMode = shouldUseOfferKpLayout({
    pathname,
    workspaceSlug: workspace?.slug,
  });

  useEffect(() => {
    if (offerKpMode) offerKp.setDocumentPanelOpen(true);
  }, [offerKpMode, offerKp]);

  const [loadingResponse, setLoadingResponse] = useState(false);
  const [chatHistory, setChatHistory] = useState(knownHistory ?? []);
  const [socketId, setSocketId] = useState(null);
  const [websocket, setWebsocket] = useState(null);
  const { files, parseAttachments } = useContext(DndUploaderContext);
  const { chatHistoryRef } = useChatContainerQuickScroll();
  const pendingMessageChecked = useRef(false);
  const pendingResetRef = useRef(false);

  useEffect(() => {
    pendingMessageChecked.current = false;
  }, [activeThreadSlug]);

  const { listening, resetTranscript } = useSpeechRecognition({
    clearTranscriptOnListen: true,
  });

  /**
   * Emit an update to the state of the prompt input without directly
   * passing a prop in so that it does not re-render constantly.
   * @param {string} messageContent - The message content to set
   * @param {'replace' | 'append'} writeMode - Replace current text or append to existing text (default: replace)
   */
  function setMessageEmit(messageContent = "", writeMode = "replace") {
    window.dispatchEvent(
      new CustomEvent(PROMPT_INPUT_EVENT, {
        detail: { messageContent, writeMode },
      })
    );
  }

  function maybeRenameThreadFromFirstMessage(message = "") {
    if (!activeThreadSlug || chatHistory.length > 0) return;
    const name = threadNameFromPrompt(message);
    if (!name) return;
    Workspace.threads
      .update(workspace.slug, activeThreadSlug, { name })
      .then(({ thread }) => {
        if (!thread?.name) return;
        window.dispatchEvent(
          new CustomEvent(THREAD_RENAME_EVENT, {
            detail: { threadSlug: activeThreadSlug, newName: thread.name },
          })
        );
      })
      .catch(() => {});
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const currentMessage =
      document.getElementById(PROMPT_INPUT_ID)?.value || "";
    if (!currentMessage) return false;

    maybeRenameThreadFromFirstMessage(currentMessage);

    // Clear the localStorage draft for this thread/workspace so that if the
    // PromptInput remounts (empty→chat transition), it won't restore stale text
    clearPromptInputDraft(activeThreadSlug ?? workspace.slug);

    const prevChatHistory = [
      ...chatHistory,
      {
        content: currentMessage,
        role: "user",
        attachments: parseAttachments(),
      },
      {
        content: "",
        role: "assistant",
        pending: true,
        userMessage: currentMessage,
        animate: true,
      },
    ];

    if (listening) {
      // Stop the mic if the send button is clicked
      endSTTSession();
    }
    setChatHistory(prevChatHistory);
    setMessageEmit("");
    setLoadingResponse(true);
  };

  function endSTTSession() {
    SpeechRecognition.stopListening();
    resetTranscript();
  }

  const regenerateAssistantMessage = (chatId) => {
    const updatedHistory = chatHistory.slice(0, -1);
    const lastUserMessage = updatedHistory.slice(-1)[0];
    Workspace.deleteChats(workspace.slug, [chatId])
      .then(() =>
        sendCommand({
          text: lastUserMessage.content,
          autoSubmit: true,
          history: updatedHistory,
          attachments: lastUserMessage?.attachments,
        })
      )
      .catch((e) => console.error(e));
  };

  /**
   * Send a command to the LLM prompt input.
   * @param {Object} options - Arguments to send to the LLM
   * @param {string} options.text - The text to send to the LLM
   * @param {boolean} options.autoSubmit - Determines if the text should be sent immediately or if it should be added to the message state (default: false)
   * @param {Object[]} options.history - The history of the chat prior to this message for overriding the current chat history
   * @param {Object[import("./DnDWrapper").Attachment]} options.attachments - The attachments to send to the LLM for this message
   * @param {'replace' | 'append' | 'prepend'} options.writeMode - Replace current text or append to existing text (default: replace)
   * @returns {void}
   */
  const sendCommand = async ({
    text = "",
    autoSubmit = false,
    history = [],
    attachments = [],
    writeMode = "replace",
  } = {}) => {
    // If we are not auto-submitting, we can just emit the text to the prompt input.
    if (!autoSubmit) {
      setMessageEmit(text, writeMode);
      return;
    }

    if (writeMode === "prepend") {
      const currentText = document.getElementById(PROMPT_INPUT_ID)?.value ?? "";
      text = currentText + " " + text;
    }

    // If we are auto-submitting in append mode
    // than we need to update text with whatever is in the prompt input + the text we are sending.
    // @note: `message` will not work here since it is not updated yet.
    // If text is still empty, after this, then we should just return.
    if (writeMode === "append") {
      const currentText = document.getElementById(PROMPT_INPUT_ID)?.value ?? "";
      text = currentText + text;
    }

    if (!text || text === "") return false;

    if (history.length === 0 && chatHistory.length === 0) {
      maybeRenameThreadFromFirstMessage(text);
    }

    // Clear the localStorage draft so that if the PromptInput remounts
    // (e.g. /reset causing empty→chat or chat→empty transitions),
    // it won't restore stale text.
    clearPromptInputDraft(activeThreadSlug ?? workspace.slug);

    // If we are auto-submitting
    // Then we can replace the current text since this is not accumulating.
    let prevChatHistory;
    if (history.length > 0) {
      // use pre-determined history chain.
      prevChatHistory = [
        ...history,
        {
          content: "",
          role: "assistant",
          pending: true,
          userMessage: text,
          attachments,
          animate: true,
        },
      ];
    } else {
      prevChatHistory = [
        ...chatHistory,
        {
          content: text,
          role: "user",
          attachments,
        },
        {
          content: "",
          role: "assistant",
          pending: true,
          userMessage: text,
          attachments,
          animate: true,
        },
      ];
    }

    setChatHistory(prevChatHistory);
    setMessageEmit("");
    setLoadingResponse(true);
  };

  useEffect(() => {
    if (pendingMessageChecked.current || !workspace?.slug) return;
    pendingMessageChecked.current = true;

    const pending = safeJsonParse(sessionStorage.getItem(PENDING_HOME_MESSAGE));
    if (pending?.message) {
      setTimeout(() => {
        sessionStorage.removeItem(PENDING_HOME_MESSAGE);
        sendCommand({
          text: pending.message,
          attachments: pending.attachments || [],
          autoSubmit: true,
        });
      }, 100);
    }
  }, [workspace?.slug]);

  useEffect(() => {
    async function fetchReply() {
      const promptMessage =
        chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;
      const remHistory = chatHistory.length > 0 ? chatHistory.slice(0, -1) : [];
      var _chatHistory = [...remHistory];

      // Override hook for new messages to now go to agents until the connection closes
      if (!!websocket) {
        if (!promptMessage || !promptMessage?.userMessage) return false;
        const attachments = promptMessage?.attachments ?? parseAttachments();
        window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));
        websocket.send(
          JSON.stringify({
            type: "awaitingFeedback",
            feedback: promptMessage?.userMessage,
            attachments,
          })
        );

        // /reset during an active agent session should end the session AND
        // clear the chat in a single action. The send above triggers the
        // server to abort the agent and close the socket; fall through to the
        // /reset flow below which resets memory + clears chat history.
        if (promptMessage.userMessage.trim() !== "/reset") return;
        pendingResetRef.current = true;
      }

      if (!promptMessage || !promptMessage?.userMessage) return false;

      // If running and edit or regeneration, this history will already have attachments
      // so no need to parse the current state.
      const attachments = promptMessage?.attachments ?? parseAttachments();
      window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));

      const conversationMemory = activeThreadSlug
        ? extractUserMemoryNotes(
            getThreadMeta(workspace.slug, activeThreadSlug).memory
          )
        : null;

      await Workspace.multiplexStream({
        workspaceSlug: workspace.slug,
        threadSlug: activeThreadSlug,
        prompt: promptMessage.userMessage,
        chatHandler: (chatResult) =>
          handleChat(
            chatResult,
            setLoadingResponse,
            setChatHistory,
            remHistory,
            _chatHistory,
            setSocketId
          ),
        attachments,
        conversationMemory: conversationMemory || null,
      });
      return;
    }
    loadingResponse === true && fetchReply();
  }, [loadingResponse, chatHistory, workspace]);

  // TODO: Simplify this WSS stuff
  useEffect(() => {
    let socket = null;

    function handleWSS() {
      try {
        if (!socketId || !!websocket) return;
        socket = new WebSocket(
          `${websocketURI()}/api/agent-invocation/${socketId}`
        );
        socket.supportsAgentStreaming = false;

        window.addEventListener(ABORT_STREAM_EVENT, () => {
          setAgentSessionActive(false);
          window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
          socket?.close();
        });

        socket.addEventListener("message", (event) => {
          setLoadingResponse(true);
          try {
            handleSocketResponse(socket, event, setChatHistory);
          } catch {
            console.error("Failed to parse data");
            setAgentSessionActive(false);
            window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
            socket.close();
          }
          setLoadingResponse(false);
        });

        socket.addEventListener("close", (_event) => {
          setAgentSessionActive(false);
          window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
          // When the close was triggered by /reset, skip the "Agent session
          // complete." status - the pending /reset flow will clear history.
          if (pendingResetRef.current) {
            pendingResetRef.current = false;
          } else {
            setChatHistory((prev) => [
              ...prev.filter((msg) => !!msg.content),
              {
                uuid: v4(),
                type: "statusResponse",
                content: "Agent session complete.",
                role: "assistant",
                sources: [],
                closed: true,
                error: null,
                animate: false,
                pending: false,
              },
            ]);
          }
          setLoadingResponse(false);
          setWebsocket(null);
          setSocketId(null);
        });
        setWebsocket(socket);
        setAgentSessionActive(true);
        window.dispatchEvent(new CustomEvent(AGENT_SESSION_START));
        window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));
      } catch (e) {
        setChatHistory((prev) => [
          ...prev.filter((msg) => !!msg.content),
          {
            uuid: v4(),
            type: "abort",
            content: e.message,
            role: "assistant",
            sources: [],
            closed: true,
            error: e.message,
            animate: false,
            pending: false,
          },
        ]);
        setLoadingResponse(false);
        setWebsocket(null);
        setSocketId(null);
      }
    }
    handleWSS();

    return () => {
      if (socket) {
        setAgentSessionActive(false);
        window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
        socket.close();
      }
    };
  }, [socketId]);

  const isEmpty =
    chatHistory.length === 0 && !sessionStorage.getItem(PENDING_HOME_MESSAGE);
  const showOfferKpHomeEmpty = isEmpty && !(offerKpMode && activeThreadSlug);

  if (showOfferKpHomeEmpty) {
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
        {offerKpMode && (
          <div className="offerKp-space-bar shrink-0">
            <CurrentWorkspaceIndicator workspace={workspace} variant="bar" />
          </div>
        )}
        <TextSizeMenu />
        <WorkspaceModelPicker
          workspaceSlug={workspace.slug}
          workspace={workspace}
        />
        <DnDFileUploaderWrapper>
          <div
            className={`flex flex-col flex-1 min-h-0 w-full overflow-y-auto ${
              offerKpMode
                ? "items-start justify-start px-6 md:px-10 lg:px-14 py-8 md:py-12"
                : "items-center justify-center"
            }`}
          >
            <div
              className={`flex flex-col w-full shrink-0 ${
                offerKpMode
                  ? "max-w-[920px] items-start"
                  : "items-center max-w-[750px]"
              }`}
            >
              {offerKpMode ? (
                <h1 className="offerKp-home-greeting">
                  {ta("home.greeting", { name: greetingName })}
                </h1>
              ) : (
                <h1 className="text-theme-text-primary text-xl md:text-2xl mb-11 text-center font-normal">
                  {t("main-page.greeting")}
                </h1>
              )}
              <PromptInput
                workspace={workspace}
                submit={handleSubmit}
                isStreaming={loadingResponse}
                sendCommand={sendCommand}
                attachments={files}
                centered={true}
                workspaceSlug={workspace?.slug}
                threadSlug={activeThreadSlug}
                placeholder={
                  offerKpMode ? ta("home.inputPlaceholder") : undefined
                }
                offerKpHome={offerKpMode}
                onWorkspaceSelect={
                  offerKpMode
                    ? (ws) => switchToWorkspace(navigate, ws)
                    : undefined
                }
              />
              {offerKpMode ? (
                <OfferKpQuickActions
                  onAction={(key) =>
                    handleOfferKpQuickActionKey(key, {
                      navigate,
                      offerKp,
                      sendCommand,
                    })
                  }
                />
              ) : (
                <QuickActions
                  hasAvailableWorkspace={!!workspace}
                  onCreateAgent={() => navigate(paths.settings.agentSkills())}
                  onEditWorkspace={() =>
                    navigate(
                      paths.workspace.settings.generalAppearance(workspace.slug)
                    )
                  }
                  onUploadDocument={() =>
                    document.getElementById("dnd-chat-file-uploader")?.click()
                  }
                />
              )}
            </div>
            {!offerKpMode && (
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

  return (
    <SourcesSidebarProvider>
      <div
        style={{
          height: isMobile
            ? "100%"
            : offerKpMode
              ? "100%"
              : "calc(100% - 32px)",
        }}
        className={`relative flex w-full h-full z-[2] flex-1 min-w-0 ${
          offerKpMode
            ? "offerKp-chat-shell flex-col"
            : "md:ml-[2px] md:mr-[16px] md:my-[16px]"
        }`}
      >
        {!offerKpMode && <TextSizeMenu />}
        <div
          className={`flex-1 min-w-0 transition-all duration-500 relative h-full overflow-hidden ${
            offerKpMode
              ? "flex flex-col"
              : "md:rounded-[16px] bg-zinc-900 light:bg-white text-white light:text-slate-900 border-none light:border-solid light:border light:border-theme-modal-border"
          }`}
        >
          {isMobile && <SidebarMobileHeader workspace={workspace} />}
          {offerKpMode && (
            <div className="offerKp-space-bar shrink-0">
              <CurrentWorkspaceIndicator workspace={workspace} variant="bar" />
            </div>
          )}
          <WorkspaceModelPicker
            workspaceSlug={workspace.slug}
            workspace={workspace}
          />
          <DnDFileUploaderWrapper>
            <div className="flex flex-col h-full w-full pb-20 md:pb-0">
              <div className="contents">
                <MetricsProvider>
                  <ChatHistory
                    ref={chatHistoryRef}
                    history={chatHistory}
                    workspace={workspace}
                    sendCommand={sendCommand}
                    updateHistory={setChatHistory}
                    regenerateAssistantMessage={regenerateAssistantMessage}
                    websocket={websocket}
                  />
                </MetricsProvider>
                <PromptInput
                  workspace={workspace}
                  submit={handleSubmit}
                  isStreaming={loadingResponse}
                  sendCommand={sendCommand}
                  attachments={files}
                  centered={false}
                />
              </div>
            </div>
          </DnDFileUploaderWrapper>
          <ChatTooltips />
        </div>
        <SourcesSidebar />
      </div>
    </SourcesSidebarProvider>
  );
}
