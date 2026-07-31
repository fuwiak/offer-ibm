import { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DndUploaderContext } from "@/components/WorkspaceChat/ChatContainer/DnDWrapper";
import { useOfferKp } from "@/contexts/OfferKpContext";
import { buildContextActions, hasQuoteDraftLines } from "@/utils/offerKp/contextActions";
import { runOfferKpContextAction } from "@/utils/offerKp/homeActions";
import {
  getThreadFollowUpSuggestions,
  getThreadMeta,
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
  const offerKp = useOfferKp();
  const dnd = useContext(DndUploaderContext);
  const attachments = dnd?.files || [];
  const [suggestions, setSuggestions] = useState([]);
  const [variant, setVariant] = useState("continue");

  const contextActions = useMemo(() => {
    if (!threadSlug) return [];
    const all = buildContextActions({
      quoteDraft: offerKp.quoteDraft,
      threadQuoteFiles: offerKp.threadQuoteFiles,
      uploadedPdfPreview: offerKp.uploadedPdfPreview,
      attachments,
      t,
      max: 4,
    });
    const hasThreadContext =
      attachments.some((a) => a?.document?.id || a?.status === "added_context") ||
      (offerKp.threadQuoteFiles || []).length > 0 ||
      hasQuoteDraftLines(offerKp.quoteDraft) ||
      !!offerKp.uploadedPdfPreview;
    if (!hasThreadContext) return [];
    return all.filter(
      (a) => a.kind !== "command" || a.id === "makeQuoteFromFile"
    );
  }, [
    threadSlug,
    offerKp.quoteDraft,
    offerKp.threadQuoteFiles,
    offerKp.uploadedPdfPreview,
    attachments,
    t,
  ]);

  useEffect(() => {
    if (!workspaceSlug || !threadSlug) {
      setSuggestions([]);
      setVariant("continue");
      return;
    }
    const meta = getThreadMeta(workspaceSlug, threadSlug);
    setSuggestions(getThreadFollowUpSuggestions(workspaceSlug, threadSlug));
    setVariant(meta.followUpVariant || "continue");
  }, [workspaceSlug, threadSlug]);

  useEffect(() => {
    function onFollowUps(event) {
      const {
        workspaceSlug: ws,
        threadSlug: ts,
        suggestions: next,
        variant: nextVariant = "continue",
      } = event.detail || {};
      if (ws !== workspaceSlug || ts !== threadSlug) return;
      const items = Array.isArray(next) ? next : [];
      setThreadFollowUpSuggestions(workspaceSlug, threadSlug, items, nextVariant);
      setSuggestions(items);
      setVariant(nextVariant || "continue");
    }

    window.addEventListener(THREAD_FOLLOW_UP_EVENT, onFollowUps);
    return () => window.removeEventListener(THREAD_FOLLOW_UP_EVENT, onFollowUps);
  }, [workspaceSlug, threadSlug]);

  const showContext = !loading && contextActions.length > 0;
  const showSuggestions = !loading && threadSlug && suggestions.length > 0;

  if (!showContext && !showSuggestions) return null;

  const labelKey =
    variant === "recovery"
      ? "home.threadFollowUps.recoveryLabel"
      : showSuggestions
        ? "home.threadFollowUps.label"
        : "home.contextFollowUps.label";

  return (
    <div
      className={`offerKp-thread-followups shrink-0 px-4 md:px-6 pt-2 pb-1${
        variant === "recovery" ? " offerKp-thread-followups--recovery" : ""
      }`}
    >
      <p className="offerKp-thread-followups__label">{t(labelKey)}</p>
      <ul className="offerKp-thread-followups__list">
        {showContext &&
          contextActions.map((action) => (
            <li key={`ctx-${action.id}`}>
              <button
                type="button"
                className="offerKp-thread-followups__item"
                onClick={() =>
                  runOfferKpContextAction(action, {
                    sendCommand,
                    offerKp,
                    workspaceSlug,
                    threadSlug,
                  })
                }
              >
                {action.label}
              </button>
            </li>
          ))}
        {showSuggestions &&
          suggestions.map((text) => (
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
