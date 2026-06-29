import React, { useEffect, useRef, useState } from "react";
import { List, Plus } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import NewWorkspaceModal, {
  useNewWorkspaceModal,
} from "../Modals/NewWorkspace";
import ActiveWorkspaces from "./ActiveWorkspaces";
import useLogo from "@/hooks/useLogo";
import useUser from "@/hooks/useUser";
import Footer from "../Footer";
import SettingsButton from "../SettingsButton";
import { Link } from "react-router-dom";
import paths from "@/utils/paths";
import { useTranslation } from "react-i18next";
import { useSidebarToggle, ToggleSidebarButton } from "./SidebarToggle";
import SearchBox from "./SearchBox";
import { Tooltip } from "react-tooltip";
import { createPortal } from "react-dom";
import OfferKpSidebarExtras from "@/components/OfferKp/OfferKpSidebarExtras";
import OfferKpSidebarBrand from "@/components/OfferKp/OfferKpSidebarBrand";
import { shouldUseOfferKpLayout } from "@/utils/offerKp/detectOfferKpMode";
import { startNewConversation } from "@/utils/offerKp/startNewConversation";
import { useLocation, useParams } from "react-router-dom";
import CurrentWorkspaceIndicator from "@/components/OfferKp/CurrentWorkspaceIndicator";

export default function Sidebar() {
  const { pathname } = useLocation();
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t: ta } = useTranslation("offerKp");
  const offerKpMode = shouldUseOfferKpLayout({ pathname, workspaceSlug: slug });
  const { user } = useUser();
  const { logo } = useLogo();
  const sidebarRef = useRef(null);
  const { showSidebar, setShowSidebar, canToggleSidebar } = useSidebarToggle();
  const {
    showing: showingNewWsModal,
    showModal: showNewWsModal,
    hideModal: hideNewWsModal,
  } = useNewWorkspaceModal();

  return (
    <>
      <div
        style={{
          width: showSidebar ? "292px" : "0px",
          paddingLeft: showSidebar ? "0px" : "16px",
        }}
        className="relative transition-all duration-500"
      >
        {canToggleSidebar && (
          <ToggleSidebarButton
            showSidebar={showSidebar}
            setShowSidebar={setShowSidebar}
          />
        )}
        <div className="overflow-hidden h-full">
          <div className="flex shrink-0 w-full justify-center my-[18px]">
            <div className="flex w-[250px] min-w-[250px] px-2">
              {offerKpMode ? (
                <div
                  className={`transition-opacity duration-500 w-full ${showSidebar ? "opacity-100" : "opacity-0"}`}
                >
                  <OfferKpSidebarBrand />
                </div>
              ) : (
                <Link to={paths.home()} aria-label="Home">
                  <img
                    src={logo}
                    alt="Logo"
                    className={`max-h-[24px] object-contain transition-opacity duration-500 ${showSidebar ? "opacity-100" : "opacity-0"}`}
                  />
                </Link>
              )}
            </div>
          </div>
          <div
            ref={sidebarRef}
            className={`relative m-[16px] min-w-[250px] p-[10px] h-[calc(100%-76px)] ${
              offerKpMode
                ? "offerKp-sidebar-shell"
                : "rounded-[16px] bg-theme-bg-sidebar light:bg-slate-200 border-[2px] border-theme-sidebar-border light:border-none"
            }`}
          >
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex-grow flex flex-col min-w-[235px] min-h-0">
                <div
                  className={`flex flex-col flex-1 min-h-0 w-full pt-[10px] ${
                    offerKpMode
                      ? "overflow-hidden"
                      : "overflow-y-auto no-scroll"
                  }`}
                >
                  <div
                    className={`flex flex-col ${
                      offerKpMode
                        ? "flex-1 min-h-0 h-full overflow-hidden gap-y-2"
                        : "gap-y-[14px]"
                    }`}
                  >
                    {offerKpMode && (
                      <button
                        type="button"
                        className="offerKp-btn-new-chat shrink-0"
                        onClick={() => startNewConversation(navigate)}
                      >
                        <Plus size={16} weight="bold" aria-hidden />
                        {ta("home.newConversation")}
                      </button>
                    )}
                    {offerKpMode && <OfferKpSidebarExtras />}
                    {!offerKpMode && (
                      <>
                        <SearchBox user={user} showNewWsModal={showNewWsModal} />
                        <ActiveWorkspaces />
                      </>
                    )}
                  </div>
                </div>
                {!offerKpMode && (
                  <div className="shrink-0 pt-2 mt-auto border-t border-theme-sidebar-border light:border-theme-sidebar-border">
                    <Footer />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {showingNewWsModal && <NewWorkspaceModal hideModal={hideNewWsModal} />}
      </div>
      <WorkspaceAndThreadTooltips />
    </>
  );
}

export function SidebarMobileHeader({ workspace = null }) {
  const { pathname } = useLocation();
  const { slug } = useParams();
  const offerKpMode = shouldUseOfferKpLayout({ pathname, workspaceSlug: slug ?? workspace?.slug });
  const { logo } = useLogo();
  const sidebarRef = useRef(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showBgOverlay, setShowBgOverlay] = useState(false);
  const {
    showing: showingNewWsModal,
    showModal: showNewWsModal,
    hideModal: hideNewWsModal,
  } = useNewWorkspaceModal();
  const { user } = useUser();

  useEffect(() => {
    // Darkens the rest of the screen
    // when sidebar is open.
    function handleBg() {
      if (showSidebar) {
        setTimeout(() => {
          setShowBgOverlay(true);
        }, 300);
      } else {
        setShowBgOverlay(false);
      }
    }
    handleBg();
  }, [showSidebar]);

  return (
    <>
      <div
        aria-label="Show sidebar"
        className="offerKp-mobile-header fixed top-0 left-0 right-0 z-10 flex justify-between items-center px-4 py-2 bg-theme-bg-sidebar light:bg-white text-slate-200 shadow-lg h-16"
      >
        <button
          onClick={() => setShowSidebar(true)}
          className="rounded-md p-2 flex items-center justify-center text-theme-text-secondary"
        >
          <List className="h-6 w-6" />
        </button>
        <div className="flex items-center justify-center flex-grow min-w-0 px-2">
          {offerKpMode ? (
            <CurrentWorkspaceIndicator
              workspace={workspace}
              variant="compact"
              className="max-w-full"
            />
          ) : (
            <img
              src={logo}
              alt="Logo"
              className="block mx-auto h-6 w-auto"
              style={{ maxHeight: "40px", objectFit: "contain" }}
            />
          )}
        </div>
        <div className="w-12"></div>
      </div>
      <div
        style={{
          transform: showSidebar ? `translateX(0vw)` : `translateX(-100vw)`,
        }}
        className={`z-99 fixed top-0 left-0 transition-all duration-500 w-[100vw] h-[100vh]`}
      >
        <div
          className={`${
            showBgOverlay
              ? "transition-all opacity-1"
              : "transition-none opacity-0"
          }  duration-500 fixed top-0 left-0 bg-theme-bg-secondary bg-opacity-75 w-screen h-screen`}
          onClick={() => setShowSidebar(false)}
        />
        <div
          ref={sidebarRef}
          className="relative h-[100vh] fixed top-0 left-0  rounded-r-[26px] bg-theme-bg-sidebar w-[80%] p-[18px] "
        >
          <div className="w-full h-full flex flex-col overflow-x-hidden items-between">
            {/* Header Information */}
            <div className="flex w-full items-center justify-between gap-x-4">
              <div className="flex shrink-1 w-fit items-center justify-start">
                <img
                  src={logo}
                  alt="Logo"
                  className="rounded w-full max-h-[40px]"
                  style={{ objectFit: "contain" }}
                />
              </div>
              {(!user || user?.role !== "default") && (
                <div className="flex gap-x-2 items-center text-slate-500 shink-0">
                  <SettingsButton />
                </div>
              )}
            </div>

            {/* Primary Body */}
            <div className="h-full flex flex-col w-full pt-4 min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto no-scroll">
                <div className="flex flex-col gap-y-4">
                  <NewWorkspaceButton
                    user={user}
                    showNewWsModal={showNewWsModal}
                  />
                  <ActiveWorkspaces />
                </div>
              </div>
              <div className="shrink-0 pt-2 pb-6 border-t border-theme-sidebar-border">
                <Footer />
              </div>
            </div>
          </div>
        </div>
        {showingNewWsModal && <NewWorkspaceModal hideModal={hideNewWsModal} />}
      </div>
    </>
  );
}

function NewWorkspaceButton({ user, showNewWsModal }) {
  const { t } = useTranslation();
  if (!!user && user?.role === "default") return null;

  return (
    <div className="flex gap-x-2 items-center justify-between">
      <button
        onClick={showNewWsModal}
        className="flex flex-grow w-[75%] h-[44px] gap-x-2 py-[5px] px-4 bg-white rounded-lg text-sidebar justify-center items-center hover:bg-opacity-80 transition-all duration-300"
      >
        <Plus className="h-5 w-5" />
        <p className="text-sidebar text-sm font-semibold">
          {t("new-workspace.title")}
        </p>
      </button>
    </div>
  );
}

function WorkspaceAndThreadTooltips() {
  return createPortal(
    <React.Fragment>
      <Tooltip
        id="workspace-name"
        place="right"
        delayShow={800}
        className="tooltip !text-xs z-99"
      />
      <Tooltip
        id="workspace-thread-name"
        place="right"
        delayShow={800}
        className="tooltip !text-xs z-99"
      />
      <Tooltip
        id="upload-workspace"
        place="top"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
      <Tooltip
        id="gear-workspace"
        place="top"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
    </React.Fragment>,
    document.body
  );
}
