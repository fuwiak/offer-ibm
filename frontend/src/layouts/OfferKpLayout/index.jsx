import { useState } from "react";
import { OfferKpProvider } from "@/contexts/OfferKpContext";
import DocumentPanel from "@/components/DocumentPanel";
import Sidebar from "@/components/Sidebar";
import { isMobile } from "react-device-detect";
import useOfferKpRole from "@/hooks/useOfferKpRole";
import OfferKpOnboarding, { useOfferKpOnboarding } from "@/components/OfferKp/OfferKpOnboarding";
import OfferKpActiveThreadSync from "@/components/OfferKp/OfferKpActiveThreadSync";
import OfferKpSavHost from "@/components/OfferKp/OfferKpSavHost";
import OfferKpHeaderActions from "@/components/OfferKp/OfferKpHeaderActions";
import UploadedPdfSidebar from "@/components/OfferKp/UploadedPdfSidebar";

/**
 * 3-panel shell: optional left sidebar · center chat · right document panel.
 * Pass `standalone` for /bot (full viewport + sidebar). Otherwise wraps chat area only.
 */
export default function OfferKpLayout({
  children,
  enabled = true,
  forceRole = null,
  standalone = false,
  workspaceSlug = null,
  threadSlug = null,
}) {
  const { role: userRole } = useOfferKpRole();
  const role = forceRole ?? (userRole === "public" ? "public" : userRole);
  const { seen, markSeen } = useOfferKpOnboarding();
  const [showOnboarding, setShowOnboarding] = useState(!seen && role !== "public");
  function handleOnboardingDone() {
    markSeen();
    setShowOnboarding(false);
  }

  const inner = (
    <OfferKpProvider enabled={enabled} role={role}>
      <OfferKpActiveThreadSync
        workspaceSlug={workspaceSlug}
        threadSlug={threadSlug}
      />
      <div className="flex flex-1 min-w-0 h-full w-full">
        <div className="offerKp-layout-main flex-1 min-w-0 flex flex-col relative min-h-0">
          {enabled && <OfferKpHeaderActions />}
          {children}
        </div>
        {enabled && <UploadedPdfSidebar />}
        {enabled && <DocumentPanel />}
      </div>
      {enabled && <OfferKpSavHost />}
      {showOnboarding && <OfferKpOnboarding onDone={handleOnboardingDone} />}
    </OfferKpProvider>
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
