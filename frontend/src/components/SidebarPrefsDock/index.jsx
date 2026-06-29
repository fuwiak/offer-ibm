import ThemeSwitcher from "@/components/ThemeSwitcher";
import LanguageSwitcher from "@/components/OfferKp/LanguageSwitcher";

/**
 * Claude Code–style sidebar footer: theme + language segmented controls,
 * full-width, non-overlapping rows docked at the bottom.
 */
export default function SidebarPrefsDock({ className = "" }) {
  return (
    <div className={`offerKp-sidebar-prefs ${className}`.trim()}>
      <ThemeSwitcher className="offerKp-sidebar-prefs__row" />
      <LanguageSwitcher className="offerKp-sidebar-prefs__row" />
    </div>
  );
}
