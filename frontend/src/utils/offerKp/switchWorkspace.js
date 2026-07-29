import paths from "@/utils/paths";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";
import { openWorkspaceHistory } from "@/utils/offerKp/lastWorkspaceThread";

/**
 * Switch to another workspace and reopen its last conversation history.
 * @param {import('react-router-dom').NavigateFunction} navigate
 * @param {{ slug: string, name: string }} workspace
 * @param {{ currentThreadSlug?: string|null, pathname?: string }} [options]
 */
export async function switchToWorkspace(navigate, workspace, options = {}) {
  if (!workspace?.slug) return;

  localStorage.setItem(
    LAST_VISITED_WORKSPACE,
    JSON.stringify({ slug: workspace.slug, name: workspace.name })
  );

  await openWorkspaceHistory(navigate, workspace, options);
}

/**
 * @deprecated prefer openWorkspaceHistory — kept for callers that only need home.
 */
export function switchToWorkspaceHome(navigate, workspace) {
  if (!workspace?.slug) return;
  localStorage.setItem(
    LAST_VISITED_WORKSPACE,
    JSON.stringify({ slug: workspace.slug, name: workspace.name })
  );
  navigate({
    pathname: paths.offerKp.home(),
    search: `?space=${encodeURIComponent(workspace.slug)}`,
  });
}
