import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DndUploaderContext } from "@/components/WorkspaceChat/ChatContainer/DnDWrapper";
import { useOfferKp } from "@/contexts/OfferKpContext";
import { buildContextActions } from "@/utils/offerKp/contextActions";
import { runOfferKpContextAction } from "@/utils/offerKp/homeActions";

/**
 * Starter / context chips on empty home or empty thread.
 * Actions open panels / files or send real OfferKP commands.
 */
export default function OfferKpNewChatFollowUps({ sendCommand }) {
  const { t } = useTranslation("offerKp");
  const offerKp = useOfferKp();
  const dnd = useContext(DndUploaderContext);
  const attachments = dnd?.files || [];

  const actions = useMemo(
    () =>
      buildContextActions({
        quoteDraft: offerKp.quoteDraft,
        threadQuoteFiles: offerKp.threadQuoteFiles,
        uploadedPdfPreview: offerKp.uploadedPdfPreview,
        attachments,
        t,
        max: 5,
      }),
    [
      offerKp.quoteDraft,
      offerKp.threadQuoteFiles,
      offerKp.uploadedPdfPreview,
      attachments,
      t,
    ]
  );

  if (!actions.length) return null;

  const hasContext =
    attachments.some((a) => a?.document?.id || a?.status === "added_context") ||
    (offerKp.threadQuoteFiles || []).length > 0 ||
    (offerKp.quoteDraft?.hardwareLines || []).length > 0 ||
    !!offerKp.uploadedPdfPreview;

  return (
    <section
      className="offerKp-thread-followups offerKp-new-chat-followups w-full mt-8"
      aria-label={
        hasContext
          ? t("home.contextFollowUps.label")
          : t("home.newChatFollowUps.label")
      }
    >
      <p className="offerKp-thread-followups__label">
        {hasContext
          ? t("home.contextFollowUps.label")
          : t("home.newChatFollowUps.label")}
      </p>
      <ul className="offerKp-thread-followups__list">
        {actions.map((action) => (
          <li key={action.id}>
            <button
              type="button"
              className="offerKp-thread-followups__item"
              onClick={() =>
                runOfferKpContextAction(action, {
                  sendCommand,
                  offerKp,
                  workspaceSlug: offerKp.activeWorkspaceSlug,
                  threadSlug: offerKp.activeThreadSlug,
                })
              }
            >
              {action.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
