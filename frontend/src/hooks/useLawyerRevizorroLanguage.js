import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

const LAWYER_REVIZORRO_LANGS = ["ru", "pl", "de", "fr", "kk"];
const DEFAULT_LANG = "ru";

export function useLawyerRevizorroLanguage() {
  const { i18n } = useTranslation("lawyerRevizorro");
  const [searchParams, setSearchParams] = useSearchParams();

  const lngParam = searchParams.get("lng");
  const resolvedLang = LAWYER_REVIZORRO_LANGS.includes(i18n.language?.split("-")[0])
    ? i18n.language.split("-")[0]
    : DEFAULT_LANG;

  // Only ?lng= in the URL overrides the default; never auto-switch from browser locale.
  useEffect(() => {
    if (!lngParam || !LAWYER_REVIZORRO_LANGS.includes(lngParam)) return;
    if (lngParam !== resolvedLang) {
      i18n.changeLanguage(lngParam);
    }
  }, [lngParam, resolvedLang, i18n]);

  function setLanguage(lng) {
    if (!LAWYER_REVIZORRO_LANGS.includes(lng)) return;
    i18n.changeLanguage(lng);
    const next = new URLSearchParams(searchParams);
    next.set("lng", lng);
    setSearchParams(next, { replace: true });
  }

  return { currentLang: resolvedLang, setLanguage, languages: LAWYER_REVIZORRO_LANGS };
}

export default useLawyerRevizorroLanguage;
