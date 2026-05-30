import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SignOut, User, Sliders } from "@phosphor-icons/react";
import paths from "@/utils/paths";
import useUser from "@/hooks/useUser";
import OfferKpPartnerNav from "@/components/OfferKp/OfferKpPartnerNav";
import OfferKpProfileNav from "@/components/OfferKp/OfferKpProfileNav";
import { startNewConversation } from "@/utils/offerKp/startNewConversation";
import { useNavigate } from "react-router-dom";

export default function OfferKpAdminSidebar() {
  const { t } = useTranslation("offerKp");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();
  const isAdmin = user?.role === "admin";

  return (
    <aside className="offerKp-suite-admin-sidebar">
      <Link to={paths.home()} className="block mb-4 no-underline">
        <div className="offerKp-brand__title">{t("brand.name")}</div>
        <div className="offerKp-brand__subtitle">{t("brand.subtitle")}</div>
      </Link>

      <button
        type="button"
        className="offerKp-btn-new-chat w-full mb-3"
        onClick={() => startNewConversation(navigate)}
      >
        <span aria-hidden>+</span>
        {t("home.newConversation")}
      </button>

      <OfferKpPartnerNav />

      <div className="offerKp-admin-user-footer mt-auto">
        <OfferKpProfileNav />
        <div className="offerKp-admin-user-footer__name flex items-center gap-2 mt-2">
          <User size={18} />
          {user?.username ?? "Admin"}
          {isAdmin && (
            <span className="text-[10px] leading-none font-semibold px-2 py-1 rounded bg-red-600 text-white tracking-wide">
              ADMIN
            </span>
          )}
        </div>
        <div className="offerKp-admin-user-footer__role">
          {t("admin.superAdmin")}
        </div>
        <div className="flex flex-col gap-1 mt-3">
          <Link
            to={paths.settings.userWorkspaces()}
            className={`offerKp-nav-item ${pathname.includes("/settings/user-workspaces") ? "offerKp-nav-item--active" : ""}`}
          >
            {t("admin.nav.userWorkspaces")}
          </Link>
          <Link to={paths.offerKp.settings()} className="offerKp-nav-item">
            <span className="flex items-center gap-2">
              <Sliders size={16} />
              {t("admin.settings")}
            </span>
          </Link>
          <Link to={paths.login(true)} className="offerKp-nav-item">
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
