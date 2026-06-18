import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CaretDown } from "@phosphor-icons/react";
import System from "@/models/system";
import Workspace from "@/models/workspace";
import showToast from "@/utils/toast";
import { SAVE_LLM_SELECTOR_EVENT } from "./PromptInput/LLMSelector/action";
import { SIDEBAR_TOGGLE_EVENT } from "@/components/Sidebar/SidebarToggle";
import {
  OFFER_KP_ALLOWED_MODELS,
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpModel,
} from "@/utils/offerKp/models";
import { OFFER_KP_OLLAMA_PROVIDER } from "@/utils/offerKp/llmProviders";

export default function OfferKpAnthropicModelPicker({ workspaceSlug }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [models] = useState(OFFER_KP_ALLOWED_MODELS);
  const [selectedModel, setSelectedModel] = useState(OFFER_KP_DEFAULT_MODEL);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.localStorage.getItem("offerKp_sidebar_toggle") !== "closed"
  );

  useEffect(() => {
    const handleToggle = (e) => setSidebarOpen(e.detail.open);
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(SIDEBAR_TOGGLE_EVENT, handleToggle);
  }, []);

  const refresh = useCallback(async () => {
    if (!workspaceSlug) return;
    const [workspace, systemSettings] = await Promise.all([
      Workspace.bySlug(workspaceSlug),
      System.keys(),
    ]);
    const current =
      workspace?.chatModel ??
      systemSettings?.LLMModel ??
      OFFER_KP_DEFAULT_MODEL;
    setSelectedModel(resolveOfferKpModel(current));
  }, [workspaceSlug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onSaved() {
      setOpen(false);
      refresh();
    }
    window.addEventListener(SAVE_LLM_SELECTOR_EVENT, onSaved);
    return () => window.removeEventListener(SAVE_LLM_SELECTOR_EVENT, onSaved);
  }, [refresh]);

  async function handleSelect(modelId) {
    if (!workspaceSlug || modelId === selectedModel) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const { message } = await Workspace.update(workspaceSlug, {
        chatProvider: OFFER_KP_OLLAMA_PROVIDER,
        chatModel: modelId,
      });
      if (message) throw new Error(message);
      setSelectedModel(modelId);
      window.dispatchEvent(new Event(SAVE_LLM_SELECTOR_EVENT));
      setOpen(false);
    } catch (err) {
      showToast(err.message || "Failed to save model", "error", { clear: true });
    } finally {
      setSaving(false);
    }
  }

  const displayName =
    models.find((m) => m.id === selectedModel)?.name || selectedModel;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
      )}
      <div
        className={`hidden md:block absolute z-30 transition-all duration-500 top-[56px] md:top-[62px] ${
          sidebarOpen ? "left-3" : "left-11"
        }`}
      >
        <div className="relative">
          <button
            type="button"
            disabled={saving}
            onClick={() => setOpen(!open)}
            className={`group border-none cursor-pointer px-2.5 py-1 flex items-center gap-1 rounded-full transition-all ${
              open
                ? "bg-zinc-700 light:bg-slate-200"
                : "hover:bg-zinc-700 light:hover:bg-slate-200"
            }`}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span
              className={`text-xs max-w-[180px] truncate ${
                open
                  ? "text-white light:text-slate-800"
                  : "text-zinc-500 light:text-slate-500 group-hover:text-white light:group-hover:text-slate-800"
              }`}
            >
              {displayName || t("chat_window.select_model")}
            </span>
            <CaretDown size={12} className="shrink-0 opacity-70" />
          </button>

          {open && (
            <ul
              role="listbox"
              className="absolute left-0 top-full mt-1 min-w-[220px] max-h-[280px] overflow-y-auto bg-zinc-800 light:bg-white border border-zinc-700 light:border-slate-300 rounded-lg shadow-lg py-1 z-40"
            >
              {models.map((model) => (
                <li key={model.id} role="option" aria-selected={model.id === selectedModel}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSelect(model.id)}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                      model.id === selectedModel
                        ? "bg-primary-button/20 text-white light:text-slate-900 font-medium"
                        : "text-zinc-300 light:text-slate-700 hover:bg-zinc-700 light:hover:bg-slate-100"
                    }`}
                  >
                    {model.name || model.id}
                    {model.hint ? (
                      <span className="block text-[10px] opacity-60 font-normal">
                        {model.hint}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
