import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useTranslation } from "react-i18next";

export default function ThemePreference() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-y-0.5 my-4">
      <p className="text-sm leading-6 font-semibold text-white">
        {t("customization.items.theme.title")}
      </p>
      <p className="text-xs text-white/60">
        {t("customization.items.theme.description")}
      </p>
      <ThemeSwitcher variant="labeled" className="mt-2 max-w-full" />
    </div>
  );
}
