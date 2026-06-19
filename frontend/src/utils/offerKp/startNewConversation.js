import paths from "@/utils/paths";
import Workspace from "@/models/workspace";
import { PROMPT_INPUT_EVENT } from "@/components/WorkspaceChat/ChatContainer/PromptInput";
import { PENDING_HOME_MESSAGE, LAST_VISITED_WORKSPACE } from "@/utils/constants";
import { resolvePartnerWorkspace } from "@/utils/offerKp/partnerWorkspace";
import showToast from "@/utils/toast";

export const OFFER_KP_NEW_CONVERSATION_EVENT = "offerKp:new-conversation";

function resetComposer() {
  sessionStorage.removeItem(PENDING_HOME_MESSAGE);
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
    { replace: false }
  );
}

/** Create a fresh thread and open the empty chat composer. */
export async function startNewConversation(navigate) {
  resetComposer();
  window.dispatchEvent(new CustomEvent(OFFER_KP_NEW_CONVERSATION_EVENT));

  try {
    const ws = await resolvePartnerWorkspace();
    if (!ws?.slug) {
      navigate(
        { pathname: paths.home(), search: `?new=${Date.now()}` },
        { replace: true }
      );
      return;
    }

    const { thread, error } = await Workspace.threads.new(ws.slug);
    if (!thread?.slug) {
      showToast(error || "Failed to start a new conversation", "error");
      navigate(
        { pathname: paths.home(), search: `?new=${Date.now()}` },
        { replace: true }
      );
      return;
    }

    localStorage.setItem(
      LAST_VISITED_WORKSPACE,
      JSON.stringify({ slug: ws.slug, name: ws.name })
    );

    navigate(paths.offerKp.thread(ws.slug, thread.slug), {
      state: { newConversation: true },
    });
  } catch (e) {
    console.error("[offerKp] startNewConversation:", e);
    showToast(e.message || "Failed to start a new conversation", "error");
    navigate(
      { pathname: paths.home(), search: `?new=${Date.now()}` },
      { replace: true }
    );
  }
}
