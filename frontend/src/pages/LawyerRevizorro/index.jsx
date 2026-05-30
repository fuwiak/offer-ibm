import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LawyerRevizorro/LanguageSwitcher";
import useLawyerRevizorroLanguage from "@/hooks/useLawyerRevizorroLanguage";
import "./lawyerRevizorro.css";

const CAPABILITY_KEYS = [
  "assistant",
  "quoting",
  "roles",
  "documents",
  "supplier",
  "whatsapp",
];

const PROFILE_KEYS = [
  "admin",
  "public",
  "partner",
  "internalSales",
  "externalSales",
  "supplier",
];

function LawyerRevizorroLogo() {
  return (
    <Link to="/lawyerRevizorro" className="ibm-z-logo">
      <span className="ibm-z-logo__mark ibm-z-logo__mark--lawyerRevizorro" aria-hidden="true" />
      <span>lawyer-revizorro</span>
    </Link>
  );
}

export default function LawyerRevizorroPage() {
  const { t } = useTranslation("lawyerRevizorro");
  const { currentLang } = useLawyerRevizorroLanguage();
  const lng = currentLang;

  return (
    <div className="ibm-z-page">
      <header>
        <div className="ibm-z-utility-bar">
          <div className="ibm-z-container ibm-z-utility-bar__inner">
            <span>{t("nav.regions")}</span>
            <LanguageSwitcher />
          </div>
        </div>

        <nav className="ibm-z-top-nav" aria-label="Main">
          <div className="ibm-z-container ibm-z-top-nav__inner">
            <LawyerRevizorroLogo />
            <ul className="ibm-z-nav-links">
              <li>
                <a href="#capabilities">{t("nav.capabilities")}</a>
              </li>
              <li>
                <a href="#profiles">{t("nav.profiles")}</a>
              </li>
              <li>
                <a href="#quoting">{t("nav.quoting")}</a>
              </li>
            </ul>
            <div className="ibm-z-nav-actions">
              <Link to="/login" className="ibm-z-btn ibm-z-btn--ghost">
                {t("nav.signIn")}
              </Link>
              <Link to={`/bot?lng=${lng}`} className="ibm-z-btn ibm-z-btn--primary">
                {t("nav.openBot")}
              </Link>
            </div>
          </div>
        </nav>
      </header>

      <main>
        <section className="ibm-z-hero" aria-labelledby="lawyerRevizorro-hero">
          <div className="ibm-z-container ibm-z-hero__grid">
            <div>
              <p className="ibm-z-eyebrow">{t("hero.eyebrow")}</p>
              <h1 id="lawyerRevizorro-hero" className="ibm-z-display-xl">
                {t("hero.title")}
              </h1>
              <p className="ibm-z-body-lg">{t("hero.subtitle")}</p>
              <div className="ibm-z-hero__actions">
                <Link to={`/bot?lng=${lng}`} className="ibm-z-btn ibm-z-btn--primary">
                  {t("hero.ctaPrimary")}
                </Link>
                <Link to="/login" className="ibm-z-btn ibm-z-btn--tertiary ibm-z-btn__chevron">
                  {t("hero.ctaSecondary")}
                </Link>
              </div>
            </div>
            <article className="ibm-z-hero-card">
              <div className="ibm-z-hero-card__pattern" aria-hidden="true" />
              <h2 className="ibm-z-display-md">{t("heroCard.title")}</h2>
              <p className="ibm-z-card-body">{t("heroCard.body")}</p>
              <Link to={`/bot?lng=${lng}`} className="ibm-z-link ibm-z-btn__chevron">
                {t("heroCard.link")}
              </Link>
            </article>
          </div>
        </section>

        <section
          id="capabilities"
          className="ibm-z-section ibm-z-section--surface"
          aria-labelledby="capabilities-heading"
        >
          <div className="ibm-z-container">
            <h2 id="capabilities-heading" className="ibm-z-display-lg">
              {t("capabilities.title")}
            </h2>
            <div className="ibm-z-card-grid ibm-z-card-grid--3">
              {CAPABILITY_KEYS.map((key) => (
                <article key={key} className="ibm-z-feature-card">
                  <h3 className="ibm-z-card-title">
                    {t(`capabilities.items.${key}.title`)}
                  </h3>
                  <p className="ibm-z-card-body">
                    {t(`capabilities.items.${key}.body`)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="profiles" className="ibm-z-section" aria-labelledby="profiles-heading">
          <div className="ibm-z-container">
            <h2 id="profiles-heading" className="ibm-z-headline">
              {t("profiles.title")}
            </h2>
            <ul className="ibm-z-profile-list">
              {PROFILE_KEYS.map((key) => (
                <li key={key}>{t(`profiles.${key}`)}</li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="quoting"
          className="ibm-z-section ibm-z-section--surface"
          aria-labelledby="quoting-heading"
        >
          <div className="ibm-z-container">
            <h2 id="quoting-heading" className="ibm-z-headline">
              {t("quoting.title")}
            </h2>
            <p className="ibm-z-body-lg">{t("quoting.steps")}</p>
            <p className="ibm-z-card-body">{t("quoting.note")}</p>
          </div>
        </section>

        <div className="ibm-z-container">
          <section className="ibm-z-cta-banner" aria-labelledby="cta-heading">
            <h2 id="cta-heading" className="ibm-z-headline">
              {t("cta.title")}
            </h2>
            <p>{t("cta.body")}</p>
            <Link to={`/bot?lng=${lng}`} className="ibm-z-btn ibm-z-btn--secondary">
              {t("cta.button")}
            </Link>
          </section>
        </div>
      </main>

      <footer className="ibm-z-footer">
        <div className="ibm-z-container">
          <div className="ibm-z-footer__brand">
            <LawyerRevizorroLogo />
            <p style={{ marginTop: "var(--ibm-spacing-lg)" }}>{t("brand.distributor")}</p>
          </div>
          <p className="ibm-z-footer__legal">
            © {new Date().getFullYear()} {t("footer.legal")}{" "}
            <Link to="/" style={{ color: "var(--ibm-inverse-ink-muted)" }}>
              {t("footer.returnApp")}
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
