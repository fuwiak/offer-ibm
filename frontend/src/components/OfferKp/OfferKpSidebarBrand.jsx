import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { goToStartScreen } from "@/utils/offerKp/startNewConversation";

export default function OfferKpSidebarBrand() {
  const navigate = useNavigate();
  const { t } = useTranslation("offerKp");

  return (
    <button
      type="button"
      className="block mb-3 no-underline w-full text-left bg-transparent border-0 p-0 cursor-pointer"
      onClick={() => goToStartScreen(navigate)}
      aria-label={t("brand.goHome")}
    >
      <div className="offerKp-brand__title">{t("brand.name")}</div>
      <div className="offerKp-brand__subtitle">{t("brand.subtitle")}</div>
    </button>
  );
}
