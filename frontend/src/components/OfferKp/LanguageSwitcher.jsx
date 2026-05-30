import useOfferKpLanguage from "@/hooks/useOfferKpLanguage";
import { useTranslation } from "react-i18next";

export default function LanguageSwitcher({ className = "" }) {
  const { t } = useTranslation("offerKp");
  const { currentLang, setLanguage, languages } = useOfferKpLanguage();

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
