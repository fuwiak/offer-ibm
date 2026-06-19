import OfferKpAdminSidebar from "@/components/OfferKp/OfferKpAdminSidebar";
import OfferKpProfileShell from "@/components/OfferKp/OfferKpProfileShell";
import { useTranslation } from "react-i18next";

/**
 * Admin shell: left navigation · center content · optional right utility column.
 */
export default function OfferKpSuiteLayout({ children, rightPanel = null }) {
  const { t } = useTranslation("offerKp");

  return (
    <OfferKpProfileShell className="offerKp-suite-root w-screen h-screen overflow-hidden">
      <OfferKpAdminSidebar />
      <div className="offerKp-suite-main">
        <div className="offerKp-suite-main__body">
          <main className="offerKp-suite-center">{children}</main>
          {rightPanel && (
            <aside className="offerKp-suite-right" aria-label={t("admin.rightPanel")}>
              {rightPanel}
            </aside>
          )}
        </div>
        <footer className="offerKp-footer-bar shrink-0 px-6">
          <span>{t("home.version")} · {t("admin.enterpriseEdition")}</span>
          <span className="flex items-center gap-1 text-theme-text-secondary">
            🛡 {t("layout.documentsRetention")}
          </span>
        </footer>
      </div>
    </OfferKpProfileShell>
  );
}
