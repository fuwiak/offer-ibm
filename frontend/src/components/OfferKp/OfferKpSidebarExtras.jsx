import { Link } from "react-router-dom";
import useOfferKpRole from "@/hooks/useOfferKpRole";
import OfferKpPartnerNav from "@/components/OfferKp/OfferKpPartnerNav";
import SidebarPrefsDock from "@/components/SidebarPrefsDock";
import paths from "@/utils/paths";
import OfferKpProfileNav from "@/components/OfferKp/OfferKpProfileNav";
import { Gear } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import CurrentWorkspaceIndicator from "@/components/OfferKp/CurrentWorkspaceIndicator";

export default function OfferKpSidebarExtras() {
  const { t } = useTranslation("offerKp");
  const { isSupplier, isAdmin } = useOfferKpRole();

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <CurrentWorkspaceIndicator variant="sidebar" className="mx-1 mb-3 shrink-0" />
      <OfferKpPartnerNav />

      {isSupplier && (
        <Link to="/supplier" className="offerKp-nav-item mx-0 shrink-0 mt-2">
          <span>Supplier Portal</span>
          <span className="text-[10px] text-theme-text-secondary">›</span>
        </Link>
      )}

      <div className="offerKp-sidebar-footer shrink-0 mt-auto">
        <div className="offerKp-sidebar-footer__nav">
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
        <SidebarPrefsDock />
      </div>
    </div>
  );
}
