import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChatCircle, Gear } from "@phosphor-icons/react";
import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import OfferKpHomeThreadHistory from "@/components/OfferKp/OfferKpHomeThreadHistory";
import { useOfferKp } from "@/contexts/OfferKpContext";

export default function OfferKpPartnerNav() {
  const { t } = useTranslation("offerKp");
  const { pathname } = useLocation();
  const { threadSlug: routeThreadSlug = null } = useParams();
  const { activeThreadSlug } = useOfferKp();
  const [workspaces, setWorkspaces] = useState([]);

  useEffect(() => {
    Workspace.all()
      .then(setWorkspaces)
      .catch(() => {});
  }, []);

  const conversationActive =
    pathname === "/" ||
    pathname.startsWith("/workspace") ||
    pathname.startsWith("/bot");

  return (
    <nav className="offerKp-partner-nav flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex flex-col shrink-0">
        <Link
          to={paths.offerKp.home()}
          className={`offerKp-nav-item ${conversationActive ? "offerKp-nav-item--active" : ""}`}
          aria-label={t("layout.conversation")}
          title={t("layout.conversation")}
        >
          <span className="flex items-center gap-2">
            <ChatCircle size={18} weight={conversationActive ? "fill" : "regular"} />
            {t("layout.conversation")}
          </span>
        </Link>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <OfferKpHomeThreadHistory
          variant="sidebar"
          activeThreadSlug={routeThreadSlug ?? activeThreadSlug}
        />
      </div>

      {workspaces.length > 0 && (
        <ul className="mt-2 flex flex-col gap-px pl-3 pr-1 shrink-0 border-t border-theme-sidebar-border pt-2">
            {workspaces.map((ws) => (
              <li
                key={ws.slug}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded-md hover:bg-theme-sidebar-subitem-hover group"
              >
                <span
                  className="flex-1 min-w-0 truncate text-xs text-theme-text-secondary group-hover:text-theme-text-primary transition-colors"
                  title={ws.name}
                >
                  {ws.name}
                </span>
                <Link
                  to={paths.settings.userWorkspaceFiles(ws.slug)}
                  className="shrink-0 p-0.5 rounded text-theme-text-secondary hover:text-primary-button transition-colors"
                  aria-label={`Manage files — ${ws.name}`}
                  title={`Manage files — ${ws.name}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Gear size={13} />
                </Link>
              </li>
            ))}
          </ul>
        )}
    </nav>
  );
}
