import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getThreadFollowUpSuggestions,
  setThreadFollowUpSuggestions,
} from "@/utils/offerKp/threadMeta";
import { THREAD_FOLLOW_UP_EVENT } from "@/utils/offerKp/threadFollowUpEvents";

export default function OfferKpThreadFollowUps({
  workspaceSlug = null,
  threadSlug = null,
  loading = false,
  sendCommand,
}) {
  const { t } = useTranslation("offerKp");
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (!workspaceSlug || !threadSlug) {
      setSuggestions([]);
      return;
    }
    setSuggestions(getThreadFollowUpSuggestions(workspaceSlug, threadSlug));
  }, [workspaceSlug, threadSlug]);

  useEffect(() => {
    function onFollowUps(event) {
      const { workspaceSlug: ws, threadSlug: ts, suggestions: next } =
        event.detail || {};
      if (ws !== workspaceSlug || ts !== threadSlug) return;
      const items = Array.isArray(next) ? next : [];
      setThreadFollowUpSuggestions(workspaceSlug, threadSlug, items);
      setSuggestions(items);
    }

    window.addEventListener(THREAD_FOLLOW_UP_EVENT, onFollowUps);
    return () => window.removeEventListener(THREAD_FOLLOW_UP_EVENT, onFollowUps);
  }, [workspaceSlug, threadSlug]);

  if (!threadSlug || loading || suggestions.length === 0) return null;

  return (
    <div className="offerKp-thread-followups shrink-0 px-4 md:px-6 pt-2 pb-1">
      <p className="offerKp-thread-followups__label">
        {t("home.threadFollowUps.label")}
      </p>
      <ul className="offerKp-thread-followups__list">
        {suggestions.map((text) => (
          <li key={text}>
            <button
              type="button"
              className="offerKp-thread-followups__item"
              onClick={() => sendCommand({ text, autoSubmit: true })}
            >
              {text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
