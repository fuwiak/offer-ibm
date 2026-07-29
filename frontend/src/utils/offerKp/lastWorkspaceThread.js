import paths from "@/utils/paths";
import Workspace from "@/models/workspace";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";
import { safeJsonParse } from "@/utils/request";
import { openThread } from "@/utils/offerKp/conversationNav";
import { threadNavLog } from "@/utils/offerKp/threadNavLogger";

/** Per-workspace last opened thread slug. */
export const LAST_THREAD_BY_WORKSPACE = "offerKp_last_thread_by_workspace";

/**
 * @param {string} workspaceSlug
 * @param {string} threadSlug
 */
export function rememberWorkspaceThread(workspaceSlug, threadSlug) {
  if (!workspaceSlug || !threadSlug) return;
  const map =
    safeJsonParse(localStorage.getItem(LAST_THREAD_BY_WORKSPACE)) || {};
  map[workspaceSlug] = { threadSlug, at: Date.now() };
  localStorage.setItem(LAST_THREAD_BY_WORKSPACE, JSON.stringify(map));
}

/**
 * @param {string} workspaceSlug
 * @returns {string|null}
 */
export function getRememberedThreadSlug(workspaceSlug) {
  if (!workspaceSlug) return null;
  const map =
    safeJsonParse(localStorage.getItem(LAST_THREAD_BY_WORKSPACE)) || {};
  const entry = map[workspaceSlug];
  return entry?.threadSlug || null;
}

/**
 * Prefer remembered thread if it still exists; else most recently updated.
 * @param {string} workspaceSlug
 * @returns {Promise<string|null>}
 */
export async function resolveWorkspaceThreadSlug(workspaceSlug) {
  if (!workspaceSlug) return null;
  const remembered = getRememberedThreadSlug(workspaceSlug);
  const { threads } = await Workspace.threads.all(workspaceSlug);
  const list = Array.isArray(threads) ? threads : [];
  if (!list.length) return null;
  if (remembered && list.some((t) => t.slug === remembered)) {
    return remembered;
  }
  const sorted = [...list].sort(
    (a, b) =>
      new Date(b.lastUpdatedAt || 0).getTime() -
      new Date(a.lastUpdatedAt || 0).getTime()
  );
  return sorted[0]?.slug || null;
}

/**
 * Open historical chat for a workspace (last thread), or home with that space
 * when no threads exist. Does NOT use ?new= (that wipes the conversation).
 * @param {import('react-router-dom').NavigateFunction} navigate
 * @param {{ slug: string, name?: string }} workspace
 * @param {{ pathname?: string }} [options]
 */
export async function openWorkspaceHistory(navigate, workspace, options = {}) {
  if (!workspace?.slug || typeof navigate !== "function") return null;

  localStorage.setItem(
    LAST_VISITED_WORKSPACE,
    JSON.stringify({ slug: workspace.slug, name: workspace.name })
  );

  const threadSlug = await resolveWorkspaceThreadSlug(workspace.slug);
  threadNavLog("nav:open-workspace-history", {
    workspaceSlug: workspace.slug,
    threadSlug,
  });

  if (threadSlug) {
    openThread(navigate, workspace.slug, threadSlug, options);
    return threadSlug;
  }

  navigate({
    pathname: paths.offerKp.home(),
    search: `?space=${encodeURIComponent(workspace.slug)}`,
  });
  return null;
}
