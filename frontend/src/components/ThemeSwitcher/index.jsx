import { useTheme } from "@/hooks/useTheme";
import { Monitor, Moon, Sun } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

const THEME_OPTIONS = [
  { key: "light", Icon: Sun },
  { key: "dark", Icon: Moon },
  { key: "system", Icon: Monitor },
];

export default function ThemeSwitcher({ className = "", variant = "compact" }) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={`cursor-theme-switcher${variant === "labeled" ? " cursor-theme-switcher--labeled" : ""} ${className}`.trim()}
      role="group"
      aria-label={t("customization.items.theme.title")}
    >
      {THEME_OPTIONS.map(({ key, Icon }) => {
        const isActive = theme === key;
        const label = t(`customization.items.theme.options.${key}`);

        return (
          <button
            key={key}
            type="button"
            className={`cursor-theme-switcher__btn${isActive ? " cursor-theme-switcher__btn--active" : ""}`}
            onClick={() => setTheme(key)}
            aria-pressed={isActive}
            aria-label={label}
            title={label}
          >
            <Icon size={16} weight={isActive ? "fill" : "regular"} aria-hidden />
            {variant === "labeled" && (
              <span className="cursor-theme-switcher__label">{label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
