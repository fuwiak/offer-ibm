import { useState, lazy, Suspense } from "react";
import { OfferKpProvider } from "@/contexts/OfferKpContext";
import Sidebar from "@/components/Sidebar";
import { isMobile } from "react-device-detect";
import useOfferKpRole from "@/hooks/useOfferKpRole";
import OfferKpOnboarding, { useOfferKpOnboarding } from "@/components/OfferKp/OfferKpOnboarding";
import OfferKpActiveThreadSync from "@/components/OfferKp/OfferKpActiveThreadSync";
import OfferKpSavHost from "@/components/OfferKp/OfferKpSavHost";
import OfferKpHeaderActions from "@/components/OfferKp/OfferKpHeaderActions";

// Pulls in the quote/document component tree, incl. pdfjs-dist (1MB+ worker),
// so it's split into its own chunk instead of blocking the initial chat route
// bundle — every workspace mounts this layout, so it still loads almost
// immediately, but no longer delays first paint/interactivity of the chat itself.
const DocumentPanel = lazy(() => import("@/components/DocumentPanel"));
const UploadedPdfSidebar = lazy(
  () => import("@/components/OfferKp/UploadedPdfSidebar")
);

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
        {enabled && (
          <div
            className="offerKp-compare-panes hidden lg:flex shrink-0 h-full min-w-0"
            aria-label="Сравнение заявки и КП"
          >
            <Suspense fallback={null}>
              <UploadedPdfSidebar />
            </Suspense>
            <Suspense fallback={null}>
              <DocumentPanel />
            </Suspense>
          </div>
        )}
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
