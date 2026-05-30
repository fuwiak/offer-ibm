import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { startNewConversation } from "@/utils/lawyerRevizorro/startNewConversation";

export default function LawyerRevizorroSidebarBrand() {
  const navigate = useNavigate();
  const { t } = useTranslation("lawyerRevizorro");

  return (
    <button
      type="button"
      className="block mb-3 no-underline w-full text-left bg-transparent border-0 p-0 cursor-pointer"
      onClick={() => startNewConversation(navigate)}
      aria-label={t("brand.newConversation")}
    >
      <div className="lawyerRevizorro-brand__title">{t("brand.name")}</div>
      <div className="lawyerRevizorro-brand__subtitle">{t("brand.subtitle")}</div>
    </button>
  );
}
