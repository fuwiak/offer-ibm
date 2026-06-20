import React from "react";
import { Outlet, useParams } from "react-router-dom";
import PasswordModal, { usePasswordModal } from "@/components/Modals/Password";
import { FullScreenLoader } from "@/components/Preloader";
import { isMobile } from "react-device-detect";
import Sidebar, { SidebarMobileHeader } from "@/components/Sidebar";
import OfferKpLayout from "@/layouts/OfferKpLayout";
import OfferKpProfileShell from "@/components/OfferKp/OfferKpProfileShell";

export default function Main() {
  const { loading, requiresAuth, mode } = usePasswordModal();
  const { slug: workspaceSlug = null, threadSlug = null } = useParams();

  if (loading) return <FullScreenLoader />;
  if (requiresAuth) return <PasswordModal mode={mode} />;

  return (
    <OfferKpProfileShell className="w-screen h-screen overflow-hidden bg-theme-bg-container">
      {!isMobile ? <Sidebar /> : <SidebarMobileHeader />}
      <OfferKpLayout
        enabled
        workspaceSlug={workspaceSlug}
        threadSlug={threadSlug}
      >
        <Outlet context={{ embeddedInMain: true }} />
      </OfferKpLayout>
    </OfferKpProfileShell>
  );
}
