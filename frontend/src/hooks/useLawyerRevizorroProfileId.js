import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import Workspace from "@/models/workspace";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";
import { safeJsonParse } from "@/utils/request";
import useLawyerRevizorroRole from "@/hooks/useLawyerRevizorroRole";
import { getEffectiveWorkspaceProfile } from "@/utils/lawyerRevizorro/userWorkspaceProfiles";

function roleFallbackProfileId(role) {
  if (role === "admin" || role === "manager") return "admin";
  if (role && role !== "default" && role !== "public") return role;
  return "partner";
}

/**
 * Resolves lawyer-revizorro profile id for color-coding (admin, partner, sales, …).
 */
export default function useLawyerRevizorroProfileId({
  workspaceSlug: slugProp = null,
  workspace: workspaceProp = null,
} = {}) {
  const { slug: routeSlug } = useParams();
  const { pathname } = useLocation();
  const { role } = useLawyerRevizorroRole();
  const slug = slugProp ?? routeSlug ?? null;
  const [profileId, setProfileId] = useState(() =>
    roleFallbackProfileId(role)
  );

  useEffect(() => {
    if (workspaceProp) {
      setProfileId(
        getEffectiveWorkspaceProfile({ userRole: role, workspace: workspaceProp })
          .id
      );
      return;
    }

    let cancelled = false;

    async function resolve() {
      let ws = null;
      if (slug) {
        ws = await Workspace.bySlug(slug);
      } else if (pathname === "/") {
        const last = safeJsonParse(localStorage.getItem(LAST_VISITED_WORKSPACE));
        if (last?.slug) ws = await Workspace.bySlug(last.slug);
        if (!ws) {
          const all = await Workspace.all();
          ws = all?.[0] ?? null;
        }
      }

      if (cancelled) return;
      if (ws) {
        setProfileId(
          getEffectiveWorkspaceProfile({ userRole: role, workspace: ws }).id
        );
      } else {
        setProfileId(roleFallbackProfileId(role));
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [slug, role, workspaceProp, pathname]);

  return profileId;
}
