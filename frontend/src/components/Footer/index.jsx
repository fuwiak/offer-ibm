import System from "@/models/system";
import {
  BookOpen,
  DiscordLogo,
  GithubLogo,
  Briefcase,
  Envelope,
  Globe,
  HouseLine,
  Info,
  LinkSimple,
} from "@phosphor-icons/react";
import React, { useEffect, useState } from "react";
import SettingsButton from "../SettingsButton";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { isMobile } from "react-device-detect";
import { Tooltip } from "react-tooltip";
import { useTranslation } from "react-i18next";

export const MAX_ICONS = 3;
export const ICON_COMPONENTS = {
  BookOpen: BookOpen,
  DiscordLogo: DiscordLogo,
  GithubLogo: GithubLogo,
  Envelope: Envelope,
  LinkSimple: LinkSimple,
  HouseLine: HouseLine,
  Globe: Globe,
  Briefcase: Briefcase,
  Info: Info,
};

export default function Footer() {
  const { t } = useTranslation();
  const [footerData, setFooterData] = useState(false);

  useEffect(() => {
    async function fetchFooterData() {
      const { footerData } = await System.fetchCustomFooterIcons();
      setFooterData(footerData);
    }
    fetchFooterData();
  }, []);

  if (footerData === false) return null;

  const links = Array.isArray(footerData) ? footerData : [];
  const hasLinks = links.length > 0;
  const showSettings = !isMobile;

  return (
    <div className="app-sidebar-footer">
      <div className="app-sidebar-footer__prefs">
        <span className="offerKp-sidebar-prefs__label">
          {t("customization.items.theme.title")}
        </span>
        <ThemeSwitcher className="offerKp-sidebar-prefs__control" />
      </div>

      {(hasLinks || showSettings) && (
        <div className="app-sidebar-footer__actions">
          {links.map((item, index) => (
            <a
              key={index}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="app-sidebar-footer__icon-btn carbon-allow-round"
              data-tooltip-id="footer-item"
              data-tooltip-content={item.url}
            >
              {React.createElement(
                ICON_COMPONENTS?.[item.icon] ?? ICON_COMPONENTS.Info,
                {
                  weight: "fill",
                  className: "h-4 w-4",
                  color: "var(--theme-sidebar-footer-icon-fill)",
                }
              )}
            </a>
          ))}
          {showSettings && <SettingsButton />}
        </div>
      )}

      <Tooltip
        id="footer-item"
        place="top"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
    </div>
  );
}
