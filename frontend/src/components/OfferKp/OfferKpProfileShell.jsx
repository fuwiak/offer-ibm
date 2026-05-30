import { useEffect } from "react";
import useOfferKpProfileId from "@/hooks/useOfferKpProfileId";

/**
 * Wraps the full offer-kp shell (sidebar + chat + panel) so profile accent CSS applies everywhere.
 */
export default function OfferKpProfileShell({
  children,
  workspaceSlug = null,
  workspace = null,
  className = "",
}) {
  const profileId = useOfferKpProfileId({ workspaceSlug, workspace });

  useEffect(() => {
    document.documentElement.setAttribute("data-offerKp-profile", profileId);
    return () => {
      document.documentElement.removeAttribute("data-offerKp-profile");
    };
  }, [profileId]);

  return (
    <div
      data-offerKp-profile={profileId}
      className={`offerKp-profile-root flex flex-1 min-w-0 min-h-0 w-full h-full ${className}`.trim()}
    >
      {children}
    </div>
  );
}
