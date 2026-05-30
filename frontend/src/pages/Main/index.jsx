import React from "react";
import { Outlet } from "react-router-dom";
import PasswordModal, { usePasswordModal } from "@/components/Modals/Password";
import { FullScreenLoader } from "@/components/Preloader";
import { isMobile } from "react-device-detect";
import Sidebar, { SidebarMobileHeader } from "@/components/Sidebar";
import LawyerRevizorroLayout from "@/layouts/LawyerRevizorroLayout";
import LawyerRevizorroProfileShell from "@/components/LawyerRevizorro/LawyerRevizorroProfileShell";

export default function Main() {
  const { loading, requiresAuth, mode } = usePasswordModal();

  if (loading) return <FullScreenLoader />;
  if (requiresAuth) return <PasswordModal mode={mode} />;

  return (
    <LawyerRevizorroProfileShell className="w-screen h-screen overflow-hidden bg-theme-bg-container">
      {!isMobile ? <Sidebar /> : <SidebarMobileHeader />}
      <LawyerRevizorroLayout enabled>
        <Outlet />
      </LawyerRevizorroLayout>
    </LawyerRevizorroProfileShell>
  );
}
