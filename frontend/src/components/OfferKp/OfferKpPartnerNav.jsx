import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChatCircle, Gear } from "@phosphor-icons/react";
import Workspace from "@/models/workspace";
import paths from "@/utils/paths";

export default function OfferKpPartnerNav() {
  const { t } = useTranslation("offerKp");
  const { pathname } = useLocation();
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
    <nav className="offerKp-partner-nav flex flex-col shrink-0">
      <div className="flex flex-col">
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

        {workspaces.length > 0 && (
          <ul className="mt-1 flex flex-col gap-px pl-3 pr-1">
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
      </div>
    </nav>
  );
}
