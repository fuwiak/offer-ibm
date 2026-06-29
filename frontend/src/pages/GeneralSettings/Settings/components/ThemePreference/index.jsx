import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useTranslation } from "react-i18next";

export default function ThemePreference() {
  const { t } = useTranslation();

  return (
    <div className="prefs-settings-panel">
      <div className="prefs-settings-panel__header">
        <p className="prefs-settings-panel__title">
          {t("customization.items.theme.title")}
        </p>
        <p className="prefs-settings-panel__description">
          {t("customization.items.theme.description")}
        </p>
      </div>
      <ThemeSwitcher variant="labeled" className="prefs-settings-panel__control" />
    </div>
  );
}
