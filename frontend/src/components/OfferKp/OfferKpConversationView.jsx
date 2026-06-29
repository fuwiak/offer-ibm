import { isMobile } from "react-device-detect";
import { SidebarMobileHeader } from "@/components/Sidebar";
import ChatHistory from "@/components/WorkspaceChat/ChatContainer/ChatHistory";
import PromptInput from "@/components/WorkspaceChat/ChatContainer/PromptInput";
import WorkspaceModelPicker from "@/components/WorkspaceChat/ChatContainer/WorkspaceModelPicker";
import CurrentWorkspaceIndicator from "@/components/OfferKp/CurrentWorkspaceIndicator";
import OfferKpQuickActions from "@/components/OfferKp/OfferKpQuickActions";
import OfferKpThreadFollowUps from "@/components/OfferKp/OfferKpThreadFollowUps";
import DnDFileUploaderWrapper from "@/components/WorkspaceChat/ChatContainer/DnDWrapper";
import { ChatTooltips } from "@/components/WorkspaceChat/ChatContainer/ChatTooltips";
import { MetricsProvider } from "@/components/WorkspaceChat/ChatContainer/ChatHistory/HistoricalMessage/Actions/RenderMetrics";
import { handleOfferKpQuickActionKey } from "@/utils/offerKp/homeActions";
import { switchToWorkspace } from "@/utils/offerKp/switchWorkspace";

/**
 * Unified OfferKP conversation shell: history + always-visible composer (flex layout).
 */
export default function OfferKpConversationView({
  workspace,
  activeThreadSlug,
  greetingName,
  ta,
  chatHistory,
  chatHistoryRef,
  handleSubmit,
  sendCommand,
  loadingResponse,
  files,
  regenerateAssistantMessage,
  websocket,
  setChatHistory,
  navigate,
  offerKp,
}) {
  const isEmpty = chatHistory.length === 0;

  return (
    <div className="relative flex w-full h-full flex-1 min-h-0 min-w-0 offerKp-chat-shell flex-col overflow-hidden">
      {isMobile && <SidebarMobileHeader workspace={workspace} />}
      <div className="offerKp-space-bar shrink-0">
        <CurrentWorkspaceIndicator workspace={workspace} variant="bar" />
      </div>
      <WorkspaceModelPicker
        workspaceSlug={workspace.slug}
        workspace={workspace}
      />
      <DnDFileUploaderWrapper>
        <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
          {isEmpty ? (
            <div className="flex flex-col flex-1 min-h-0 overflow-y-auto items-start justify-start px-6 md:px-10 lg:px-14 py-8 md:py-12">
              <div className="flex flex-col w-full max-w-[920px] shrink-0 items-start">
                <h1 className="offerKp-home-greeting">
                  {ta("home.greeting", { name: greetingName })}
                </h1>
                <OfferKpQuickActions
                  onAction={(key) =>
                    handleOfferKpQuickActionKey(key, {
                      navigate,
                      offerKp,
                      sendCommand,
                    })
                  }
                />
              </div>
            </div>
          ) : (
            <MetricsProvider>
              <ChatHistory
                ref={chatHistoryRef}
                history={chatHistory}
                workspace={workspace}
                sendCommand={sendCommand}
                updateHistory={setChatHistory}
                regenerateAssistantMessage={regenerateAssistantMessage}
                websocket={websocket}
                offerKpMode={true}
              />
            </MetricsProvider>
          )}
          <OfferKpThreadFollowUps
            workspaceSlug={workspace?.slug}
            threadSlug={activeThreadSlug}
            loading={loadingResponse}
            sendCommand={sendCommand}
          />
          <div className="offerKp-thread-prompt shrink-0 px-4 md:px-6 pb-4 pt-2">
            <PromptInput
              workspace={workspace}
              submit={handleSubmit}
              isStreaming={loadingResponse}
              sendCommand={sendCommand}
              attachments={files}
              centered={false}
              layout="flex"
              workspaceSlug={workspace?.slug}
              threadSlug={activeThreadSlug}
              placeholder={ta("home.inputPlaceholder")}
              offerKpHome={true}
              offerKpThread={true}
              onWorkspaceSelect={(ws) => switchToWorkspace(navigate, ws)}
            />
          </div>
        </div>
      </DnDFileUploaderWrapper>
      <ChatTooltips />
    </div>
  );
}
