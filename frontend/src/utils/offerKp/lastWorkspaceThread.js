import paths from "@/utils/paths";
import Workspace from "@/models/workspace";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";
import { threadNavLog } from "@/utils/offerKp/threadNavLogger";
import {
  LAST_THREAD_BY_WORKSPACE,
  rememberWorkspaceThread,
  getRememberedThreadSlug,
  getRememberedThreadAt,
  pickNewestThread,
  resolveThreadSlugFromList,
} from "@/utils/offerKp/lastWorkspaceThreadCore";

export {
  LAST_THREAD_BY_WORKSPACE,
  rememberWorkspaceThread,
  getRememberedThreadSlug,
  getRememberedThreadAt,
  pickNewestThread,
  resolveThreadSlugFromList,
};

/**
 * Prefer remembered thread if still valid and not superseded by a newer one
 * created after the remember timestamp (covers Home-submit race).
 * @param {string} workspaceSlug
 * @returns {Promise<string|null>}
 */
export async function resolveWorkspaceThreadSlug(workspaceSlug) {
  if (!workspaceSlug) return null;
  const remembered = getRememberedThreadSlug(workspaceSlug);
  const rememberedAt = getRememberedThreadAt(workspaceSlug);
  const { threads } = await Workspace.threads.all(workspaceSlug);
  const list = Array.isArray(threads) ? threads : [];
  return resolveThreadSlugFromList(list, remembered, rememberedAt);
}

/**
 * Open historical chat for a workspace (last thread), or home with that space
 * when no threads exist. Does NOT use ?new= (that wipes the conversation).
 * @param {import('react-router-dom').NavigateFunction} navigate
 * @param {{ slug: string, name?: string }} workspace
 * @param {{ pathname?: string, currentThreadSlug?: string|null }} [options]
 */
export async function openWorkspaceHistory(navigate, workspace, options = {}) {
  if (!workspace?.slug || typeof navigate !== "function") return null;

  localStorage.setItem(
    LAST_VISITED_WORKSPACE,
    JSON.stringify({ slug: workspace.slug, name: workspace.name })
  );

  // Lazy import avoids pulling ChatContainer into unit tests of remember helpers.
  const { openThread } = await import("@/utils/offerKp/conversationNav");

  const current = options.currentThreadSlug || null;
  if (current) {
    const { threads } = await Workspace.threads.all(workspace.slug);
    const list = Array.isArray(threads) ? threads : [];
    if (list.some((t) => t.slug === current)) {
      threadNavLog("nav:open-workspace-history-current", {
        workspaceSlug: workspace.slug,
        threadSlug: current,
      });
      rememberWorkspaceThread(workspace.slug, current);
      openThread(navigate, workspace.slug, current, options);
      return current;
    }
  }

  const threadSlug = await resolveWorkspaceThreadSlug(workspace.slug);
  threadNavLog("nav:open-workspace-history", {
    workspaceSlug: workspace.slug,
    threadSlug,
  });

  if (threadSlug) {
    rememberWorkspaceThread(workspace.slug, threadSlug);
    openThread(navigate, workspace.slug, threadSlug, options);
    return threadSlug;
  }

  navigate({
    pathname: paths.offerKp.home(),
    search: `?space=${encodeURIComponent(workspace.slug)}`,
  });
  return null;
}
