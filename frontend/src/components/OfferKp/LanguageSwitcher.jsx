import useOfferKpLanguage from "@/hooks/useOfferKpLanguage";
import { useTranslation } from "react-i18next";

export default function LanguageSwitcher({ className = "" }) {
  const { t } = useTranslation("offerKp");
  const { currentLang, setLanguage, languages } = useOfferKpLanguage();

  return (
    <div
      className={`cursor-segmented-control cursor-segmented-control--lang ${className}`.trim()}
      role="group"
      aria-label="Language"
    >
      {languages.map((lng) => (
        <button
          key={lng}
          type="button"
          className={`cursor-segmented-control__btn${currentLang === lng ? " cursor-segmented-control__btn--active" : ""}`}
          onClick={() => setLanguage(lng)}
          aria-pressed={currentLang === lng}
          title={t(`lang.${lng}`)}
        >
          <span className="cursor-segmented-control__label">{t(`lang.${lng}`)}</span>
        </button>
      ))}
    </div>
  );
}
