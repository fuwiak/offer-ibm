import paths from "@/utils/paths";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";

/**
 * Switch to another workspace (space): persist choice and open home in that context.
 * @param {import('react-router-dom').NavigateFunction} navigate
 * @param {{ slug: string, name: string }} workspace
 */
export function switchToWorkspace(navigate, workspace) {
  if (!workspace?.slug) return;

  localStorage.setItem(
    LAST_VISITED_WORKSPACE,
    JSON.stringify({ slug: workspace.slug, name: workspace.name })
  );

  navigate({
    pathname: paths.lawyerRevizorro.home(),
    search: `?space=${encodeURIComponent(workspace.slug)}&new=${Date.now()}`,
  });
}
