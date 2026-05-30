import { useEffect } from "react";
import useLawyerRevizorroProfileId from "@/hooks/useLawyerRevizorroProfileId";

/**
 * Wraps the full lawyer-revizorro shell (sidebar + chat + panel) so profile accent CSS applies everywhere.
 */
export default function LawyerRevizorroProfileShell({
  children,
  workspaceSlug = null,
  workspace = null,
  className = "",
}) {
  const profileId = useLawyerRevizorroProfileId({ workspaceSlug, workspace });

  useEffect(() => {
    document.documentElement.setAttribute("data-lawyerRevizorro-profile", profileId);
    return () => {
      document.documentElement.removeAttribute("data-lawyerRevizorro-profile");
    };
  }, [profileId]);

  return (
    <div
      data-lawyerRevizorro-profile={profileId}
      className={`lawyerRevizorro-profile-root flex flex-1 min-w-0 min-h-0 w-full h-full ${className}`.trim()}
    >
      {children}
    </div>
  );
}
