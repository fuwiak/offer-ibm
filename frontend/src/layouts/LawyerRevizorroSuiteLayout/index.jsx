import LawyerRevizorroAdminSidebar from "@/components/LawyerRevizorro/LawyerRevizorroAdminSidebar";
import { useTranslation } from "react-i18next";

/**
 * Admin shell: left navigation · center content · optional right utility column.
 */
export default function LawyerRevizorroSuiteLayout({ children, rightPanel = null }) {
  const { t } = useTranslation("lawyerRevizorro");

  return (
    <div className="lawyerRevizorro-suite-root w-screen h-screen overflow-hidden">
      <LawyerRevizorroAdminSidebar />
      <div className="lawyerRevizorro-suite-main">
        <div className="lawyerRevizorro-suite-main__body">
          <main className="lawyerRevizorro-suite-center">{children}</main>
          {rightPanel && (
            <aside className="lawyerRevizorro-suite-right" aria-label={t("admin.rightPanel")}>
              {rightPanel}
            </aside>
          )}
        </div>
        <footer className="lawyerRevizorro-footer-bar shrink-0 px-6">
          <span>{t("home.version")} · {t("admin.enterpriseEdition")}</span>
          <span className="flex gap-4">
            <a href="/lawyerRevizorro">{t("home.privacy")}</a>
            <a href="/lawyerRevizorro">{t("home.terms")}</a>
          </span>
          <span className="flex items-center gap-1 text-theme-text-secondary">
            🛡 {t("layout.documentsRetention")}
          </span>
        </footer>
      </div>
    </div>
  );
}
