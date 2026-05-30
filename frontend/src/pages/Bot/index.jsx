import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LawyerRevizorroLayout from "@/layouts/LawyerRevizorroLayout";
import LawyerRevizorroProfileShell from "@/components/LawyerRevizorro/LawyerRevizorroProfileShell";
import PartnerRequestModal from "@/components/LawyerRevizorro/PartnerRequestModal";
import LanguageSwitcher from "@/components/LawyerRevizorro/LanguageSwitcher";
import useLawyerRevizorroLanguage from "@/hooks/useLawyerRevizorroLanguage";
import LawyerRevizorro from "@/models/lawyerRevizorro";
import { useLawyerRevizorro } from "@/contexts/LawyerRevizorroContext";
import { advanceQuoteDraft, INITIAL_QUOTE_DRAFT } from "@/utils/lawyerRevizorro/quoteFlow";
import { PUBLIC_SLUG } from "@/utils/lawyerRevizorro/detectLawyerRevizorroMode";
import Workspace from "@/models/workspace";
import WorkspaceChat from "@/components/WorkspaceChat";
import { FullScreenLoader } from "@/components/Preloader";
import System from "@/models/system";
import { AUTH_TOKEN } from "@/utils/constants";

function PublicBotChat() {
  const { t } = useTranslation("lawyerRevizorro");
  const { setQuoteDraft, setDocumentPreview } = useLawyerRevizorro();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showPartner, setShowPartner] = useState(false);
  const sessionId = useRef(
    `public-${Math.random().toString(36).slice(2)}`
  ).current;

  const suggestions = [t("bot.suggested"), t("bot.suggested2"), t("bot.suggested3")];

  function sendMessage(text) {
    if (!text?.trim() || streaming) return;
    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    let assistantText = "";
    LawyerRevizorro.streamPublicChat(
      text,
      sessionId,
      (chunk) => {
        assistantText += chunk;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: assistantText };
          return next;
        });
      },
      () => setStreaming(false)
    );
  }

  function startQuoteDemo() {
    const draft = advanceQuoteDraft(INITIAL_QUOTE_DRAFT);
    setQuoteDraft(draft);
    if (draft.preview) setDocumentPreview(draft.preview);
    sendMessage("I would like to start a guided quote for lawyer-revizorro One 8.3");
  }

  return (
    <div className="flex flex-col h-full bg-theme-bg-primary lawyerRevizorro-chat-shell">
      <header className="flex items-center justify-between px-4 py-3 border-b border-theme-sidebar-border shrink-0">
        <div>
          <Link
            to="/lawyerRevizorro"
            className="text-xs text-primary-button hover:underline no-underline"
          >
            lawyer-revizorro
          </Link>
          <h1 className="text-sm font-semibold text-theme-text-primary">
            {t("bot.title")}
          </h1>
          <p className="text-xs text-theme-text-secondary">{t("bot.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => setShowPartner(true)}
            className="text-xs px-3 py-2 border border-primary-button text-primary-button bg-transparent hover:bg-theme-sidebar-item-hover"
          >
            {t("bot.partnerCta")}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => sendMessage(s)}
                className="carbon-tertiary-btn text-xs px-3 py-2"
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              onClick={startQuoteDemo}
              className="text-xs px-3 py-1.5 bg-[#0f62fe] text-white"
            >
              {t("quote.stepProduct")}
            </button>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-sm max-w-[85%] ${
              m.role === "user"
                ? "ml-auto bg-blue-600 text-white px-3 py-2"
                : "bg-white/10 text-white/90 light:bg-slate-100 light:text-slate-800 px-3 py-2"
            }`}
          >
            {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
      </div>

      <form
        className="p-4 border-t border-white/10 light:border-slate-200 flex gap-2 shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
          className="flex-1 bg-white/10 text-white light:bg-slate-100 light:text-slate-900 px-3 py-2 text-sm border-0 focus:outline focus:outline-2 focus:outline-blue-500"
          placeholder="Message lawyer-revizorro…"
        />
        <button
          type="submit"
          disabled={streaming}
          className="px-4 py-2 bg-[#0f62fe] text-white text-sm disabled:opacity-50"
        >
          Send
        </button>
      </form>

      <PartnerRequestModal isOpen={showPartner} onClose={() => setShowPartner(false)} />
    </div>
  );
}

function AuthenticatedBotWorkspace() {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const slug = PUBLIC_SLUG;
      const ws = await Workspace.bySlug(slug);
      setWorkspace(ws);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <FullScreenLoader />;
  if (!workspace) return <PublicBotChat />;

  return (
    <WorkspaceChat loading={false} workspace={workspace} />
  );
}

export default function BotPage() {
  useLawyerRevizorroLanguage();
  const [useWorkspace, setUseWorkspace] = useState(null);

  useEffect(() => {
    async function resolve() {
      const { MultiUserMode, RequiresAuth } = await System.keys();
      const hasSession = !!localStorage.getItem(AUTH_TOKEN);
      setUseWorkspace(
        (!MultiUserMode && !RequiresAuth) || hasSession
      );
    }
    resolve();
  }, []);

  if (useWorkspace === null) return <FullScreenLoader />;

  return (
    <LawyerRevizorroProfileShell
      workspaceSlug={PUBLIC_SLUG}
      className="w-screen h-screen overflow-hidden bg-theme-bg-container flex"
    >
      <LawyerRevizorroLayout enabled forceRole="public" standalone>
        {useWorkspace ? <AuthenticatedBotWorkspace /> : <PublicBotChat />}
      </LawyerRevizorroLayout>
    </LawyerRevizorroProfileShell>
  );
}
