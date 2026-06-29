import { useTheme } from "@/hooks/useTheme";
import { Monitor, Moon, Sun } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

const THEME_OPTIONS = [
  { key: "light", Icon: Sun },
  { key: "dark", Icon: Moon },
  { key: "system", Icon: Monitor },
];

export default function ThemeSwitcher({
  className = "",
  variant = "compact",
}) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const rootClass = [
    "cursor-segmented-control",
    variant === "labeled" ? "cursor-segmented-control--labeled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClass}
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
            className={`cursor-segmented-control__btn${isActive ? " cursor-segmented-control__btn--active" : ""}`}
            onClick={() => setTheme(key)}
            aria-pressed={isActive}
            aria-label={label}
            title={label}
          >
            <Icon size={16} weight={isActive ? "fill" : "regular"} aria-hidden />
            {variant === "labeled" && (
              <span className="cursor-segmented-control__label">{label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
