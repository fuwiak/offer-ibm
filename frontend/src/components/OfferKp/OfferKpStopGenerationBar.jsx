import { useTranslation } from "react-i18next";
import StopGenerationButton from "@/components/WorkspaceChat/ChatContainer/PromptInput/StopGenerationButton";

export default function OfferKpStopGenerationBar({ visible = false }) {
  const { t } = useTranslation("offerKp");

  if (!visible) return null;

  return (
    <div
      className="offerKp-stop-generation-bar shrink-0 px-4 md:px-6 pb-2"
      role="status"
      aria-live="polite"
    >
      <div className="offerKp-stop-generation-bar__inner">
        <span className="offerKp-stop-generation-bar__label">
          {t("chat.generating")}
        </span>
        <StopGenerationButton offerKpHome showLabel />
      </div>
    </div>
  );
}
