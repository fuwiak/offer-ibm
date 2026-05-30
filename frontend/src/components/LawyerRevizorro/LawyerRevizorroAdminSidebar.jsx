import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SignOut, User, Sliders } from "@phosphor-icons/react";
import paths from "@/utils/paths";
import useUser from "@/hooks/useUser";
import LawyerRevizorroPartnerNav from "@/components/LawyerRevizorro/LawyerRevizorroPartnerNav";
import LawyerRevizorroProfileNav from "@/components/LawyerRevizorro/LawyerRevizorroProfileNav";
import { startNewConversation } from "@/utils/lawyerRevizorro/startNewConversation";
import { useNavigate } from "react-router-dom";

export default function LawyerRevizorroAdminSidebar() {
  const { t } = useTranslation("lawyerRevizorro");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();
  const isAdmin = user?.role === "admin";

  return (
    <aside className="lawyerRevizorro-suite-admin-sidebar">
      <Link to={paths.home()} className="block mb-4 no-underline">
        <div className="lawyerRevizorro-brand__title">lawyer-revizorro</div>
        <div className="lawyerRevizorro-brand__subtitle">Enterprise Suite</div>
      </Link>

      <button
        type="button"
        className="lawyerRevizorro-btn-new-chat w-full mb-3"
        onClick={() => startNewConversation(navigate)}
      >
        <span aria-hidden>+</span>
        {t("home.newConversation")}
      </button>

      <LawyerRevizorroPartnerNav />

      <div className="lawyerRevizorro-admin-user-footer mt-auto">
        <LawyerRevizorroProfileNav />
        <div className="lawyerRevizorro-admin-user-footer__name flex items-center gap-2 mt-2">
          <User size={18} />
          {user?.username ?? "Admin"}
          {isAdmin && (
            <span className="text-[10px] leading-none font-semibold px-2 py-1 rounded bg-red-600 text-white tracking-wide">
              ADMIN
            </span>
          )}
        </div>
        <div className="lawyerRevizorro-admin-user-footer__role">
          {t("admin.superAdmin")}
        </div>
        <div className="flex flex-col gap-1 mt-3">
          <Link
            to={paths.settings.userWorkspaces()}
            className={`lawyerRevizorro-nav-item ${pathname.includes("/settings/user-workspaces") ? "lawyerRevizorro-nav-item--active" : ""}`}
          >
            {t("admin.nav.userWorkspaces")}
          </Link>
          <Link to={paths.lawyerRevizorro.settings()} className="lawyerRevizorro-nav-item">
            <span className="flex items-center gap-2">
              <Sliders size={16} />
              {t("admin.settings")}
            </span>
          </Link>
          <Link to={paths.login(true)} className="lawyerRevizorro-nav-item">
            <span className="flex items-center gap-2">
              <SignOut size={16} />
              {t("admin.logout")}
            </span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
