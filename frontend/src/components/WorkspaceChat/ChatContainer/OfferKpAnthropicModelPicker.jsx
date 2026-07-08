import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CaretDown } from "@phosphor-icons/react";
import Workspace from "@/models/workspace";
import OfferKp from "@/models/offerKp";
import showToast from "@/utils/toast";
import LmStudioModelLoadModal from "@/components/OfferKp/LmStudioModelLoadModal";
import { SAVE_LLM_SELECTOR_EVENT } from "./PromptInput/LLMSelector/action";
import { OFFER_KP_NEW_CONVERSATION_EVENT } from "@/utils/offerKp/startNewConversation";
import { SIDEBAR_TOGGLE_EVENT } from "@/components/Sidebar/SidebarToggle";
import System from "@/models/system";
import {
  OFFER_KP_LOCAL_MODELS,
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpModel,
  findOfferKpModel,
  mergeLmStudioRemoteModels,
  isLmStudioChatModelId,
  isOfferKpPickerModel,
} from "@/utils/offerKp/models";

function resolveLocalPickerModel(modelId, availableModels = OFFER_KP_LOCAL_MODELS) {
  return resolveOfferKpModel(modelId, availableModels);
}

export default function OfferKpAnthropicModelPicker({
  workspaceSlug,
  workspace: _workspace = null,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(OFFER_KP_DEFAULT_MODEL);
  const [availableModels, setAvailableModels] = useState(OFFER_KP_LOCAL_MODELS);
  const [saving, setSaving] = useState(false);
  const [loadModal, setLoadModal] = useState({
    open: false,
    modelId: "",
    modelName: "",
    phase: "saving_workspace",
    error: null,
    loadTimeSeconds: null,
  });
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.localStorage.getItem("offerKp_sidebar_toggle") !== "closed"
  );
  const [menuRect, setMenuRect] = useState(null);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuRect(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 240),
    });
  }, [open, selectedModel]);

  useEffect(() => {
    const handleToggle = (e) => setSidebarOpen(e.detail.open);
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(SIDEBAR_TOGGLE_EVENT, handleToggle);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(e) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-offer-kp-model-picker-menu]")
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const refreshAvailableModels = useCallback(async () => {
    const { models = [] } = await System.customModels("lmstudio", null, null, 8000);
    const chatOnly = models.filter(
      (m) =>
        isLmStudioChatModelId(m?.id || m) && isOfferKpPickerModel(m?.id || m)
    );
    const merged = mergeLmStudioRemoteModels(chatOnly, OFFER_KP_LOCAL_MODELS);
    if (merged.length) setAvailableModels(merged);
    return merged;
  }, []);

  useEffect(() => {
    refreshAvailableModels().catch(() => {});
  }, [refreshAvailableModels]);

  const refresh = useCallback(async () => {
    if (!workspaceSlug) return;

    const ws = await Workspace.bySlug(workspaceSlug);
    if (!ws) return;

    const localModel = resolveLocalPickerModel(ws.chatModel, availableModels);
    setSelectedModel(localModel);

    const needsSync = ws.chatProvider !== "lmstudio" || ws.chatModel !== localModel;

    if (needsSync) {
      const { workspace: synced } = await Workspace.update(workspaceSlug, {
        chatProvider: "lmstudio",
        chatModel: localModel,
        agentProvider: "lmstudio",
        agentModel: localModel,
      }).catch(() => ({ workspace: null }));
      if (synced?.chatModel) {
        setSelectedModel(
          resolveLocalPickerModel(synced.chatModel, availableModels)
        );
      }
    }
  }, [workspaceSlug, availableModels]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onSaved() {
      setOpen(false);
      refresh();
    }
    window.addEventListener(SAVE_LLM_SELECTOR_EVENT, onSaved);
    window.addEventListener(OFFER_KP_NEW_CONVERSATION_EVENT, refresh);
    return () => {
      window.removeEventListener(SAVE_LLM_SELECTOR_EVENT, onSaved);
      window.removeEventListener(OFFER_KP_NEW_CONVERSATION_EVENT, refresh);
    };
  }, [refresh]);

  async function handleSelect(modelId) {
    if (!workspaceSlug || modelId === selectedModel) {
      setOpen(false);
      return;
    }
    const meta = findOfferKpModel(modelId, availableModels);
    const previousModel = selectedModel;
    const needsVramLoad = meta?.loaded !== true;

    setOpen(false);
    setLoadModal({
      open: true,
      modelId,
      modelName: meta?.name || modelId,
      phase: "saving_workspace",
      error: null,
      loadTimeSeconds: null,
    });
    setSelectedModel(modelId);
    setSaving(true);

    try {
      const { message, workspace: updatedWorkspace } = await Workspace.update(
        workspaceSlug,
        {
          chatProvider: meta?.provider || "lmstudio",
          chatModel: modelId,
          agentProvider: meta?.provider || "lmstudio",
          agentModel: modelId,
        }
      );
      if (message) throw new Error(message);

      const resolvedModel = resolveLocalPickerModel(
        updatedWorkspace?.chatModel || modelId,
        availableModels
      );
      setSelectedModel(resolvedModel);

      let loadTimeSeconds = null;
      if (needsVramLoad) {
        setLoadModal((prev) => ({ ...prev, phase: "loading_vram" }));
        const loadResult = await OfferKp.loadLmStudioModel(modelId);
        loadTimeSeconds = loadResult?.loadTimeSeconds ?? null;
        await refreshAvailableModels();
        setLoadModal((prev) => ({
          ...prev,
          phase: loadResult?.alreadyLoaded ? "already_loaded" : "success",
          loadTimeSeconds,
        }));
      } else {
        setLoadModal((prev) => ({ ...prev, phase: "already_loaded" }));
      }

      window.dispatchEvent(new Event(SAVE_LLM_SELECTOR_EVENT));

      if (!needsVramLoad) {
        window.setTimeout(() => {
          setLoadModal((prev) => ({ ...prev, open: false }));
        }, 1200);
      }
    } catch (err) {
      setSelectedModel(previousModel);
      setLoadModal((prev) => ({
        ...prev,
        phase: "error",
        error: err.message || "Failed to switch model",
      }));
      showToast(err.message || "Failed to save model", "error", {
        clear: true,
      });
    } finally {
      setSaving(false);
    }
  }

  function closeLoadModal() {
    setLoadModal((prev) => ({ ...prev, open: false }));
  }

  const displayName =
    findOfferKpModel(selectedModel, availableModels)?.name || selectedModel;

  const menu =
    open &&
    menuRect &&
    createPortal(
      <ul
        role="listbox"
        data-offer-kp-model-picker-menu=""
        style={{
          position: "fixed",
          top: menuRect.top,
          left: menuRect.left,
          minWidth: menuRect.width,
        }}
        className="max-h-[320px] overflow-y-auto bg-zinc-800 light:bg-white border border-zinc-700 light:border-slate-300 rounded-lg shadow-lg py-1 z-[10000]"
      >
        {availableModels.map((model) => (
          <li
            key={model.id}
            role="option"
            aria-selected={model.id === selectedModel}
          >
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSelect(model.id)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                model.id === selectedModel
                  ? "bg-primary-button/20 text-white light:text-slate-900 font-medium"
                  : model.loaded === false
                    ? "text-zinc-400 light:text-slate-500 hover:bg-zinc-700 light:hover:bg-slate-100"
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
      </ul>,
      document.body
    );

  return (
    <div
      ref={rootRef}
      data-offer-kp-model-picker=""
      className={`hidden md:block absolute z-50 transition-all duration-500 top-[56px] md:top-[62px] ${
        sidebarOpen ? "left-3" : "left-11"
      }`}
    >
      <button
        ref={buttonRef}
        type="button"
        disabled={saving}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
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
      {menu}
      <LmStudioModelLoadModal
        isOpen={loadModal.open}
        modelName={loadModal.modelName}
        phase={loadModal.phase}
        error={loadModal.error}
        loadTimeSeconds={loadModal.loadTimeSeconds}
        onClose={closeLoadModal}
      />
    </div>
  );
}
