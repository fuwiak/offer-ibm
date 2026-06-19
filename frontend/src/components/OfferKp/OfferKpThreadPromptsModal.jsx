import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChatText, Plus, Trash, X } from "@phosphor-icons/react";
import paths from "@/utils/paths";
import {
  addThreadPrompt,
  getThreadPrompts,
  removeThreadPrompt,
} from "@/utils/offerKp/threadMeta";
import {
  PROMPT_INPUT_EVENT,
  PROMPT_INPUT_ID,
} from "@/components/WorkspaceChat/ChatContainer/PromptInput";

export default function OfferKpThreadPromptsModal({
  thread = null,
  workspace = null,
  onClose,
}) {
  const { t } = useTranslation("offerKp");
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!workspace?.slug || !thread?.slug) return;
    setPrompts(getThreadPrompts(workspace.slug, thread.slug));
    setDraft("");
  }, [workspace?.slug, thread?.slug]);

  if (!thread || !workspace?.slug) return null;

  function handleAdd() {
    const next = addThreadPrompt(workspace.slug, thread.slug, draft);
    setPrompts(next);
    setDraft("");
  }

  function handleRemove(index) {
    const next = removeThreadPrompt(workspace.slug, thread.slug, index);
    setPrompts(next);
  }

  function handleUsePrompt(text) {
    navigate(paths.offerKp.thread(workspace.slug, thread.slug));
    onClose();
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(PROMPT_INPUT_EVENT, {
          detail: { messageContent: text, writeMode: "replace" },
        })
      );
      document.getElementById(PROMPT_INPUT_ID)?.focus();
    }, 120);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offerKp-thread-prompts-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-lg border border-theme-sidebar-border bg-theme-bg-secondary p-5 shadow-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3
              id="offerKp-thread-prompts-title"
              className="text-sm font-semibold text-theme-text-primary"
            >
              {t("home.threadPrompts.title")}
            </h3>
            <p className="mt-1 truncate text-xs text-theme-text-secondary">
              {thread.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 border-none bg-transparent p-1 text-theme-text-secondary hover:text-theme-text-primary"
            aria-label={t("home.deleteConfirmCancel")}
          >
            <X size={16} />
          </button>
        </div>

        <p className="mt-3 text-xs text-theme-text-secondary shrink-0">
          {t("home.threadPrompts.hint")}
        </p>

        <div className="mt-3 flex gap-2 shrink-0">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("home.threadPrompts.placeholder")}
            rows={2}
            className="flex-1 min-w-0 resize-none rounded-md border border-theme-sidebar-border bg-transparent px-3 py-2 text-xs text-theme-text-primary placeholder:text-theme-text-secondary focus:outline-none focus:border-primary-button"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!draft.trim()}
            className="shrink-0 self-end flex items-center gap-1 rounded-md border-none bg-primary-button px-3 py-2 text-xs text-white disabled:opacity-40"
          >
            <Plus size={14} weight="bold" />
            {t("home.threadPrompts.add")}
          </button>
        </div>

        <ul className="offerKp-thread-prompts__list mt-4 flex-1 min-h-0 overflow-y-auto">
          {prompts.length === 0 ? (
            <li className="text-xs text-theme-text-secondary py-2">
              {t("home.threadPrompts.empty")}
            </li>
          ) : (
            prompts.map((prompt, index) => (
              <li key={`${index}-${prompt.slice(0, 24)}`} className="offerKp-thread-prompts__item">
                <button
                  type="button"
                  className="offerKp-thread-prompts__use flex-1 min-w-0 text-left"
                  onClick={() => handleUsePrompt(prompt)}
                  title={t("home.threadPrompts.use")}
                >
                  <ChatText size={14} className="shrink-0 text-primary-button" />
                  <span className="truncate">{prompt}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="shrink-0 border-none bg-transparent p-1 text-theme-text-secondary hover:text-red-500"
                  aria-label={t("home.threadPrompts.remove")}
                >
                  <Trash size={14} />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
