import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OfferKpLayout from "@/layouts/OfferKpLayout";
import OfferKpProfileShell from "@/components/OfferKp/OfferKpProfileShell";
import PartnerRequestModal from "@/components/OfferKp/PartnerRequestModal";
import LanguageSwitcher from "@/components/OfferKp/LanguageSwitcher";
import useOfferKpLanguage from "@/hooks/useOfferKpLanguage";
import OfferKp from "@/models/offerKp";
import { useOfferKp } from "@/contexts/OfferKpContext";
import { advanceQuoteDraft, INITIAL_QUOTE_DRAFT } from "@/utils/offerKp/quoteFlow";
import { PUBLIC_SLUG } from "@/utils/offerKp/detectOfferKpMode";
import Workspace from "@/models/workspace";
import WorkspaceChat from "@/components/WorkspaceChat";
import { FullScreenLoader } from "@/components/Preloader";
import System from "@/models/system";
import { AUTH_TOKEN } from "@/utils/constants";

function PublicBotChat() {
  const { t } = useTranslation("offerKp");
  const { setQuoteDraft, setDocumentPreview } = useOfferKp();
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
    OfferKp.streamPublicChat(
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
    sendMessage("I would like to start a guided quote for offer-kp One 8.3");
  }

  return (
    <div className="flex flex-col h-full bg-theme-bg-primary offerKp-chat-shell">
      <header className="flex items-center justify-between px-4 py-3 border-b border-theme-sidebar-border shrink-0">
        <div>
          <Link
            to="/offerKp"
            className="text-xs text-primary-button hover:underline no-underline"
          >
            offer-kp
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
              className="text-xs px-3 py-1.5 bg-[#cc785c] text-white"
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
                ? "ml-auto bg-primary-button text-white px-3 py-2"
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
          className="flex-1 bg-white/10 text-white light:bg-slate-100 light:text-slate-900 px-3 py-2 text-sm border-0 focus:outline focus:outline-2 focus:outline-primary-button"
          placeholder="Message offer-kp…"
        />
        <button
          type="submit"
          disabled={streaming}
          className="px-4 py-2 bg-[#cc785c] text-white text-sm disabled:opacity-50"
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
  useOfferKpLanguage();
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
    <OfferKpProfileShell
      workspaceSlug={PUBLIC_SLUG}
      className="w-screen h-screen overflow-hidden bg-theme-bg-container flex"
    >
      <OfferKpLayout enabled forceRole="public" standalone>
        {useWorkspace ? <AuthenticatedBotWorkspace /> : <PublicBotChat />}
      </OfferKpLayout>
    </OfferKpProfileShell>
  );
}
