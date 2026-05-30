import Workspace from "@/models/workspace";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";
import { safeJsonParse } from "@/utils/request";

export const PARTNER_WORKSPACE_SLUG =
  import.meta.env.VITE_LAWYER_REVIZORRO_PARTNER_WORKSPACE || "lawyerRevizorro-partner";

/**
 * Resolves the workspace used for partner chat from the home screen.
 * Prefers configured slug, then any lawyerRevizorro-* workspace, then last visited.
 */
export async function resolvePartnerWorkspace(
  fallbackName = "lawyer-revizorro Partner",
  preferredSlug = null
) {
  if (preferredSlug) {
    const preferred = await Workspace.bySlug(preferredSlug);
    if (preferred) return preferred;
  }

  const bySlug = await Workspace.bySlug(PARTNER_WORKSPACE_SLUG);
  if (bySlug) return bySlug;

  const all = await Workspace.all();
  const lawyerRevizorroWs = all.find((w) => w.slug?.startsWith("lawyerRevizorro"));
  if (lawyerRevizorroWs) return lawyerRevizorroWs;

  const lastVisited = safeJsonParse(localStorage.getItem(LAST_VISITED_WORKSPACE));
  if (lastVisited?.slug) {
    const ws = await Workspace.bySlug(lastVisited.slug);
    if (ws) return ws;
  }

  if (all.length > 0) return all[0];

  const { workspace } = await Workspace.new({ name: fallbackName });
  return workspace;
}
