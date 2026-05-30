import useLawyerRevizorroLanguage from "@/hooks/useLawyerRevizorroLanguage";
import { useTranslation } from "react-i18next";

export default function LanguageSwitcher({ className = "" }) {
  const { t } = useTranslation("lawyerRevizorro");
  const { currentLang, setLanguage, languages } = useLawyerRevizorroLanguage();

  return (
    <div
      className={`ibm-z-lang-switcher ${className}`}
      role="group"
      aria-label="Language"
    >
      {languages.map((lng) => (
        <button
          key={lng}
          type="button"
          className={`ibm-z-lang-btn${currentLang === lng ? " ibm-z-lang-btn--active" : ""}`}
          onClick={() => setLanguage(lng)}
          aria-pressed={currentLang === lng}
        >
          {t(`lang.${lng}`)}
        </button>
      ))}
    </div>
  );
}
