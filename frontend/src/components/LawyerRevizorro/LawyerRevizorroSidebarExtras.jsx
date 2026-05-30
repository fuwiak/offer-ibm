import { Link } from "react-router-dom";
import useLawyerRevizorroRole from "@/hooks/useLawyerRevizorroRole";
import LawyerRevizorroPartnerNav from "@/components/LawyerRevizorro/LawyerRevizorroPartnerNav";
import LanguageSwitcher from "@/components/LawyerRevizorro/LanguageSwitcher";
import paths from "@/utils/paths";
import LawyerRevizorroProfileNav from "@/components/LawyerRevizorro/LawyerRevizorroProfileNav";
import { Gear } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import CurrentWorkspaceIndicator from "@/components/LawyerRevizorro/CurrentWorkspaceIndicator";

export default function LawyerRevizorroSidebarExtras() {
  const { t } = useTranslation("lawyerRevizorro");
  const { isSupplier, isAdmin } = useLawyerRevizorroRole();

  return (
    <div className="flex flex-col flex-1 min-h-0 pb-2">
      <CurrentWorkspaceIndicator variant="sidebar" className="mx-1 mb-3" />
      <LawyerRevizorroPartnerNav />

      {isSupplier && (
        <Link to="/supplier" className="lawyerRevizorro-nav-item mx-0 shrink-0 mt-2">
          <span>Supplier Portal</span>
          <span className="text-[10px] text-theme-text-secondary">›</span>
        </Link>
      )}

      <div className="lawyerRevizorro-partner-nav__footer border-t border-theme-sidebar-border mt-auto pt-2 shrink-0">
        <LawyerRevizorroProfileNav />
        {isAdmin && (
          <Link to={paths.lawyerRevizorro.settings()} className="lawyerRevizorro-nav-item">
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
