import TextSizeMenu from "@/components/WorkspaceChat/ChatContainer/TextSizeMenu";
import UserButton from "@/components/UserMenu/UserButton";
import { Database } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import useUser from "@/hooks/useUser";
import paths from "@/utils/paths";

/** Text size, catalog DB (admin) and profile — top-right of the main content column only. */
export default function OfferKpHeaderActions() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { t } = useTranslation("offerKp");
  const isAdmin = !user || user?.role === "admin";

  return (
    <div className="offerKp-header-actions">
      <TextSizeMenu embedded />
      {isAdmin && (
        <button
          type="button"
          onClick={() => navigate(paths.offerKp.dbExplorer())}
          title={t("admin.db.title")}
          aria-label={t("admin.db.title")}
          className="transition-all duration-300 w-[35px] h-[35px] rounded-full flex items-center justify-center shrink-0 bg-theme-action-menu-bg hover:bg-theme-action-menu-item-hover text-white hover:border-slate-100 hover:border-opacity-50 border-transparent border"
        >
          <Database size={16} />
        </button>
      )}
      <UserButton embedded />
    </div>
  );
}
