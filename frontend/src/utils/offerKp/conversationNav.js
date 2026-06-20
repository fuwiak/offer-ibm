import paths from "@/utils/paths";
import Workspace from "@/models/workspace";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";
import { resolvePartnerWorkspace } from "@/utils/offerKp/partnerWorkspace";
import showToast from "@/utils/toast";
import {
  threadNavLog,
  threadSlugFromPath,
} from "@/utils/offerKp/threadNavLogger";
import { PROMPT_INPUT_EVENT } from "@/components/WorkspaceChat/ChatContainer/PromptInput";
import { buildDraftNavigateState } from "@/utils/offerKp/conversationNavCore";

export {
  threadHistoryKey,
  shouldReplayDraft,
  threadPath,
} from "@/utils/offerKp/conversationNavCore";

export function clearDraft(navigate, pathname) {
  navigate(pathname, { replace: true, state: {} });
}

function resetComposerInput() {
  window.dispatchEvent(
    new CustomEvent(PROMPT_INPUT_EVENT, {
      detail: { messageContent: "", writeMode: "replace" },
    })
  );
}

/** Navigate to an existing thread (no draft replay). */
export function openThread(navigate, workspaceSlug, threadSlug, options = {}) {
  if (!workspaceSlug || !threadSlug) {
    threadNavLog("open:skipped-missing-slug", { workspaceSlug, threadSlug });
    return;
  }

  const target = paths.offerKp.thread(workspaceSlug, threadSlug);
  const { pathname = "" } = options;
  const currentThread = threadSlugFromPath(pathname);
  const isSameThread = pathname === target && currentThread === threadSlug;

  threadNavLog("open:navigate", {
    from: pathname,
    to: target,
    workspaceSlug,
    threadSlug,
    currentThread,
    isSameThread,
  });

  resetComposerInput();
  navigate(target, { replace: isSameThread, state: {} });
}

/** Navigate to thread with a draft message from Home (auto-submit on mount). */
export function submitDraftFromHome(
  navigate,
  workspaceSlug,
  threadSlug,
  draft = {}
) {
  if (!workspaceSlug || !threadSlug) return;
  const target = paths.offerKp.thread(workspaceSlug, threadSlug);
  threadNavLog("nav:submit-draft", {
    workspaceSlug,
    threadSlug,
    hasMessage: !!draft?.message?.trim(),
  });
  navigate(target, { state: buildDraftNavigateState(draft) });
}

/** Create a new empty thread and open it. */
export async function createThreadAndOpen(navigate, workspaceSlug = null) {
  resetComposerInput();

  try {
    const ws = workspaceSlug
      ? await Workspace.bySlug(workspaceSlug)
      : await resolvePartnerWorkspace();

    if (!ws?.slug) {
      navigate(
        { pathname: paths.home(), search: `?new=${Date.now()}` },
        {
          replace: true,
          state: {},
        }
      );
      return null;
    }

    const { thread, error } = await Workspace.threads.new(ws.slug);
    if (!thread?.slug) {
      showToast(error || "Failed to start a new conversation", "error");
      return null;
    }

    localStorage.setItem(
      LAST_VISITED_WORKSPACE,
      JSON.stringify({ slug: ws.slug, name: ws.name })
    );

    const target = paths.offerKp.thread(ws.slug, thread.slug);
    threadNavLog("nav:new-thread", {
      workspaceSlug: ws.slug,
      threadSlug: thread.slug,
    });
    navigate(target, { state: { newConversation: true } });
    return thread;
  } catch (e) {
    console.error("[offerKp] createThreadAndOpen:", e);
    showToast(e.message || "Failed to start a new conversation", "error");
    return null;
  }
}
