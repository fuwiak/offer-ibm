import { Link } from "react-router-dom";
import OfferKpPageShell from "@/components/OfferKp/OfferKpPageShell";
import LanguageSwitcher from "@/components/OfferKp/LanguageSwitcher";
import { useTheme } from "@/hooks/useTheme";
import useUser from "@/hooks/useUser";
import paths from "@/utils/paths";
import { useTranslation } from "react-i18next";

export default function AccountSettingsPage() {
  const { t } = useTranslation("offerKp");
  const { theme, setTheme, availableThemes } = useTheme();
  const { user } = useUser();
  const canUserWorkspaces =
    user?.role === "admin" || user?.role === "manager";

  return (
    <OfferKpPageShell title={t("admin.settings")} subtitle={t("account.settingsSubtitle")}>
      <div className="max-w-2xl space-y-8">
        <section className="border border-theme-sidebar-border bg-theme-bg-primary p-6 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-theme-text-primary">
            {t("account.preferences")}
          </h2>
          <div>
            <label className="block text-xs uppercase tracking-wide text-theme-text-secondary mb-2">
              {t("account.language")}
            </label>
            <LanguageSwitcher />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-theme-text-secondary mb-2">
              {t("account.appearance")}
            </label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="offerKp-carbon-select"
            >
              {Object.entries(availableThemes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </section>

        {canUserWorkspaces && (
          <section className="border border-theme-sidebar-border bg-theme-bg-primary p-6 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-theme-text-primary">
              {t("admin.nav.userWorkspaces", { defaultValue: "User Workspaces" })}
            </h2>
            <p className="text-sm text-theme-text-secondary">
              Manage isolated 1:1 user+workspace spaces, profile templates, and access.
            </p>
            <Link
              to={paths.settings.userWorkspaces()}
              className="offerKp-btn-new-chat inline-flex w-auto no-underline"
            >
              {t("admin.nav.userWorkspaces", { defaultValue: "User Workspaces" })}
            </Link>
          </section>
        )}

        {!canUserWorkspaces && (
          <p className="text-sm text-theme-text-secondary">{t("account.settingsHint")}</p>
        )}

        <Link to={paths.login(true)} className="offerKp-btn-new-chat inline-flex w-auto no-underline">
          {t("admin.logout")}
        </Link>
      </div>
    </OfferKpPageShell>
  );
}
