import ThemeSwitcher from "@/components/ThemeSwitcher";
import LanguageSwitcher from "@/components/OfferKp/LanguageSwitcher";
import { useTranslation } from "react-i18next";

function PrefGroup({ label, children }) {
  return (
    <div className="offerKp-sidebar-prefs__group">
      <span className="offerKp-sidebar-prefs__label">{label}</span>
      {children}
    </div>
  );
}

/**
 * Sidebar footer: theme and language in labeled, full-width rows.
 */
export default function SidebarPrefsDock({ className = "", showLanguage = true }) {
  const { t } = useTranslation("offerKp");
  const { t: tc } = useTranslation();

  return (
    <div className={`offerKp-sidebar-prefs ${className}`.trim()}>
      <PrefGroup label={tc("customization.items.theme.title")}>
        <ThemeSwitcher className="offerKp-sidebar-prefs__control" />
      </PrefGroup>
      {showLanguage && (
        <PrefGroup label={t("prefs.language", { defaultValue: "Language" })}>
          <LanguageSwitcher className="offerKp-sidebar-prefs__control" />
        </PrefGroup>
      )}
    </div>
  );
}
