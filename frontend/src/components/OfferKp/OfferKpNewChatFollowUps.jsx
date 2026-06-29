import { useTranslation } from "react-i18next";
import { NEW_CHAT_KP_FOLLOW_UP_KEYS } from "@/utils/offerKp/newChatFollowUps";

/**
 * Starter follow-ups on an empty thread — КП / catalog workflow (no LLM round-trip).
 */
export default function OfferKpNewChatFollowUps({ sendCommand }) {
  const { t } = useTranslation("offerKp");

  if (!sendCommand) return null;

  return (
    <section
      className="offerKp-thread-followups offerKp-new-chat-followups w-full mt-8"
      aria-label={t("home.newChatFollowUps.label")}
    >
      <p className="offerKp-thread-followups__label">
        {t("home.newChatFollowUps.label")}
      </p>
      <ul className="offerKp-thread-followups__list">
        {NEW_CHAT_KP_FOLLOW_UP_KEYS.map((key) => {
          const text = t(`home.newChatFollowUps.items.${key}`);
          return (
            <li key={key}>
              <button
                type="button"
                className="offerKp-thread-followups__item"
                onClick={() =>
                  sendCommand({ text, writeMode: "replace", autoSubmit: true })
                }
              >
                {text}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
