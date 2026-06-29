import useUser from "@/hooks/useUser";
import paths from "@/utils/paths";
import { ArrowUUpLeft, Wrench } from "@phosphor-icons/react";
import { Link, useMatch } from "react-router-dom";

const iconBtnClass =
  "app-sidebar-footer__icon-btn carbon-allow-round transition-colors duration-150";

export default function SettingsButton() {
  const isInSettings = !!useMatch("/settings/*");
  const { user } = useUser();

  if (!user || user?.role !== "admin") return null;

  if (isInSettings) {
    return (
      <Link
        to={paths.home()}
        className={iconBtnClass}
        aria-label="Home"
        data-tooltip-id="footer-item"
        data-tooltip-content="Back to workspaces"
      >
        <ArrowUUpLeft
          className="h-4 w-4"
          weight="fill"
          color="var(--theme-sidebar-footer-icon-fill)"
        />
      </Link>
    );
  }

  return (
    <Link
      to={paths.settings.interface()}
      className={iconBtnClass}
      aria-label="Settings"
      data-tooltip-id="footer-item"
      data-tooltip-content="Open settings"
    >
      <Wrench
        className="h-4 w-4"
        weight="fill"
        color="var(--theme-sidebar-footer-icon-fill)"
      />
    </Link>
  );
}
