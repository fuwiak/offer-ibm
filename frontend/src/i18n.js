import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { defaultNS, resources } from "./locales/resources";

const LAWYER_REVIZORRO_UI_LANGS = ["ru", "pl", "de", "fr", "kk"];

i18next
  .use(initReactI18next)
  .use(LanguageDetector)
  .init({
    lng: "ru",
    fallbackLng: "ru",
    supportedLngs: LAWYER_REVIZORRO_UI_LANGS,
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    debug: import.meta.env.DEV,
    defaultNS,
    ns: [defaultNS, "lawyerRevizorro"],
    resources,
    lowerCaseLng: true,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["querystring", "localStorage", "htmlTag"],
      lookupQuerystring: "lng",
      lookupLocalStorage: "i18nextLng",
      caches: ["localStorage"],
    },
  });

// One-time migration to Russian default language for offer-ibm UI.
const LAWYER_REVIZORRO_LANG_MIGRATION_KEY = "offerIbmUiLangV1";
if (!localStorage.getItem(LAWYER_REVIZORRO_LANG_MIGRATION_KEY)) {
  const stored = localStorage.getItem("i18nextLng")?.split("-")[0];
  if (!stored || stored === "pl" || !LAWYER_REVIZORRO_UI_LANGS.includes(stored)) {
    localStorage.setItem("i18nextLng", "ru");
    i18next.changeLanguage("ru");
  }
  localStorage.setItem(LAWYER_REVIZORRO_LANG_MIGRATION_KEY, "1");
}

export default i18next;
