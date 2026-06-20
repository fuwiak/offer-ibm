import paths from "@/utils/paths";
import { PROMPT_INPUT_EVENT } from "@/components/WorkspaceChat/ChatContainer/PromptInput";
import {
  createThreadAndOpen,
  openThread,
} from "@/utils/offerKp/conversationNav";

export const OFFER_KP_NEW_CONVERSATION_EVENT = "offerKp:new-conversation";

function resetComposer() {
  window.dispatchEvent(
    new CustomEvent(PROMPT_INPUT_EVENT, {
      detail: { messageContent: "", writeMode: "replace" },
    })
  );
}

/** Reset composer and open the home start screen (no new thread). */
export function goToStartScreen(navigate) {
  resetComposer();
  window.dispatchEvent(new CustomEvent(OFFER_KP_NEW_CONVERSATION_EVENT));
  navigate(
    { pathname: paths.home(), search: `?new=${Date.now()}` },
    { replace: false, state: {} }
  );
}

/** Open an existing thread and load its conversation history. */
export function openThreadConversation(
  navigate,
  workspaceSlug,
  threadSlug,
  options = {}
) {
  openThread(navigate, workspaceSlug, threadSlug, options);
}

/** Create a fresh thread and open the empty chat composer. */
export async function startNewConversation(navigate) {
  resetComposer();
  window.dispatchEvent(new CustomEvent(OFFER_KP_NEW_CONVERSATION_EVENT));
  await createThreadAndOpen(navigate);
}
