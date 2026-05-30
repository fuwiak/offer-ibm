import { useTranslation } from "react-i18next";
export default function LawyerRevizorroPageShell({ title, subtitle, children }) {
  const { t } = useTranslation("lawyerRevizorro");

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full lawyerRevizorro-chat-shell lawyerRevizorro-home-shell overflow-hidden">
      <header className="lawyerRevizorro-suite-page-header px-6 md:px-10 lg:px-14 py-6 border-b border-theme-sidebar-border shrink-0">
        <div className="min-w-0 pr-24 md:pr-32">
          <h1 className="lawyerRevizorro-suite-page-title !mb-0">{title}</h1>
          {subtitle && (
            <p className="text-sm text-theme-text-secondary mt-2 max-w-2xl">{subtitle}</p>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-6 md:px-10 lg:px-14 py-6">{children}</div>
      <footer className="lawyerRevizorro-footer-bar shrink-0">
        <span>{t("home.version")}</span>
        <span className="flex gap-4">
          <a href="/lawyerRevizorro">{t("home.privacy")}</a>
          <a href="/lawyerRevizorro">{t("home.terms")}</a>
        </span>
      </footer>
    </div>
  );
}
