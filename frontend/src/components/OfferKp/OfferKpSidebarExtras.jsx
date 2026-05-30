import { Link } from "react-router-dom";
import useOfferKpRole from "@/hooks/useOfferKpRole";
import OfferKpPartnerNav from "@/components/OfferKp/OfferKpPartnerNav";
import LanguageSwitcher from "@/components/OfferKp/LanguageSwitcher";
import paths from "@/utils/paths";
import OfferKpProfileNav from "@/components/OfferKp/OfferKpProfileNav";
import { Gear } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import CurrentWorkspaceIndicator from "@/components/OfferKp/CurrentWorkspaceIndicator";

export default function OfferKpSidebarExtras() {
  const { t } = useTranslation("offerKp");
  const { isSupplier, isAdmin } = useOfferKpRole();

  return (
    <div className="flex flex-col flex-1 min-h-0 pb-2">
      <CurrentWorkspaceIndicator variant="sidebar" className="mx-1 mb-3" />
      <OfferKpPartnerNav />

      {isSupplier && (
        <Link to="/supplier" className="offerKp-nav-item mx-0 shrink-0 mt-2">
          <span>Supplier Portal</span>
          <span className="text-[10px] text-theme-text-secondary">›</span>
        </Link>
      )}

      <div className="offerKp-partner-nav__footer border-t border-theme-sidebar-border mt-auto pt-2 shrink-0">
        <OfferKpProfileNav />
        {isAdmin && (
          <Link to={paths.offerKp.settings()} className="offerKp-nav-item">
            <span className="flex items-center gap-2">
              <Gear size={18} />
              {t("admin.settings")}
            </span>
          </Link>
        )}
      </div>

      <div className="px-1 pt-2 shrink-0">
        <LanguageSwitcher />
      </div>
    </div>
  );
}
