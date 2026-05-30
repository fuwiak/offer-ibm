import { useState } from "react";
import { LawyerRevizorroProvider } from "@/contexts/LawyerRevizorroContext";
import DocumentPanel from "@/components/DocumentPanel";
import Sidebar from "@/components/Sidebar";
import { isMobile } from "react-device-detect";
import useLawyerRevizorroRole from "@/hooks/useLawyerRevizorroRole";
import LawyerRevizorroOnboarding, { useLawyerRevizorroOnboarding } from "@/components/LawyerRevizorro/LawyerRevizorroOnboarding";
import LawyerRevizorroActiveThreadSync from "@/components/LawyerRevizorro/LawyerRevizorroActiveThreadSync";
import LawyerRevizorroSavHost from "@/components/LawyerRevizorro/LawyerRevizorroSavHost";

/**
 * 3-panel shell: optional left sidebar · center chat · right document panel.
 * Pass `standalone` for /bot (full viewport + sidebar). Otherwise wraps chat area only.
 */
export default function LawyerRevizorroLayout({
  children,
  enabled = true,
  forceRole = null,
  standalone = false,
  workspaceSlug = null,
  threadSlug = null,
}) {
  const { role: userRole } = useLawyerRevizorroRole();
  const role = forceRole ?? (userRole === "public" ? "public" : userRole);
  const { seen, markSeen } = useLawyerRevizorroOnboarding();
  const [showOnboarding, setShowOnboarding] = useState(!seen && role !== "public");
  function handleOnboardingDone() {
    markSeen();
    setShowOnboarding(false);
  }

  const inner = (
    <LawyerRevizorroProvider enabled={enabled} role={role}>
      <LawyerRevizorroActiveThreadSync
        workspaceSlug={workspaceSlug}
        threadSlug={threadSlug}
      />
      <div className="flex flex-1 min-w-0 h-full w-full">
        <div className="flex-1 min-w-0 flex flex-col">{children}</div>
        {enabled && <DocumentPanel />}
      </div>
      {enabled && <LawyerRevizorroSavHost />}
      {showOnboarding && <LawyerRevizorroOnboarding onDone={handleOnboardingDone} />}
    </LawyerRevizorroProvider>
  );

  if (!standalone) {
    return <div className="flex flex-1 min-w-0 h-full w-full overflow-hidden">{inner}</div>;
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex flex-1 min-w-0">
      {!isMobile && <Sidebar />}
      {inner}
    </div>
  );
}
