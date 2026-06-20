import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Workspace from "@/models/workspace";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";
import { SAVE_LLM_SELECTOR_EVENT } from "@/components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector/action";
import { threadNavLog } from "@/utils/offerKp/threadNavLogger";

export function threadHistoryKey(slug, threadSlug = null) {
  return `${slug ?? ""}:${threadSlug ?? "default"}`;
}

/**
 * Loads workspace + chat history for the current URL thread.
 * URL params are the single source of truth.
 */
export default function useWorkspaceThreadChat() {
  const { slug = null, threadSlug = null } = useParams();
  const historyKey = threadHistoryKey(slug, threadSlug);

  const [workspace, setWorkspace] = useState(null);
  const [history, setHistory] = useState(null);
  const [readyKey, setReadyKey] = useState(null);

  const loading = !slug || readyKey !== historyKey || history === null;

  useEffect(() => {
    if (!slug) {
      setWorkspace(null);
      setHistory(null);
      setReadyKey(null);
      return undefined;
    }

    let cancelled = false;
    setHistory(null);
    setReadyKey(null);

    async function load() {
      threadNavLog("page:load-start", { slug, threadSlug, historyKey });

      const ws = await Workspace.bySlug(slug);
      if (!ws) {
        if (!cancelled) {
          setWorkspace(null);
          setHistory([]);
          setReadyKey(historyKey);
          threadNavLog("page:load-missing-workspace", { slug, historyKey });
        }
        return;
      }

      const [suggestedMessages, { showAgentCommand }, chatHistory] =
        await Promise.all([
          Workspace.getSuggestedMessages(slug),
          Workspace.agentCommandAvailable(slug),
          threadSlug
            ? Workspace.threads.chatHistory(slug, threadSlug)
            : Workspace.chatHistory(slug),
        ]);

      if (cancelled) return;

      setWorkspace({
        ...ws,
        suggestedMessages,
        showAgentCommand,
      });
      setHistory(chatHistory ?? []);
      setReadyKey(historyKey);

      threadNavLog("page:load-done", {
        slug,
        threadSlug,
        historyKey,
        historyCount: chatHistory?.length ?? 0,
      });

      localStorage.setItem(
        LAST_VISITED_WORKSPACE,
        JSON.stringify({ slug: ws.slug, name: ws.name })
      );
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, threadSlug, historyKey]);

  useEffect(() => {
    if (!slug) return undefined;
    async function syncWorkspaceModel() {
      const updated = await Workspace.bySlug(slug);
      if (!updated) return;
      setWorkspace((prev) => (prev ? { ...prev, ...updated } : prev));
    }
    window.addEventListener(SAVE_LLM_SELECTOR_EVENT, syncWorkspaceModel);
    return () =>
      window.removeEventListener(SAVE_LLM_SELECTOR_EVENT, syncWorkspaceModel);
  }, [slug]);

  return {
    slug,
    threadSlug,
    historyKey,
    workspace,
    history,
    loading,
    ready: readyKey === historyKey && history !== null,
  };
}
