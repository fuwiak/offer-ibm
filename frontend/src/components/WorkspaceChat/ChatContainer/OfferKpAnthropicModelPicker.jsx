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
import showToast from "@/utils/toast";
import { SAVE_LLM_SELECTOR_EVENT } from "./PromptInput/LLMSelector/action";
import { SIDEBAR_TOGGLE_EVENT } from "@/components/Sidebar/SidebarToggle";
import {
  OFFER_KP_LOCAL_MODELS,
  OFFER_KP_CLOUD_MODELS,
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpModel,
  findOfferKpModel,
} from "@/utils/offerKp/models";

function isLocalModel(modelId) {
  return OFFER_KP_LOCAL_MODELS.some((m) => m.id === modelId);
}

function ModelDropdown({
  label,
  models,
  selectedModelId,
  isActiveGroup,
  open,
  onToggle,
  onSelect,
  saving,
  placeholder,
}) {
  const buttonRef = useRef(null);
  const [menuRect, setMenuRect] = useState(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuRect(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 220),
    });
  }, [open, label]);

  const activeInGroup = isActiveGroup
    ? models.find((m) => m.id === selectedModelId)
    : null;
  const displayName = activeInGroup?.name || placeholder;

  const menu =
    open &&
    menuRect &&
    createPortal(
      <ul
        role="listbox"
        aria-label={label}
        data-offer-kp-model-picker-menu=""
        style={{
          position: "fixed",
          top: menuRect.top,
          left: menuRect.left,
          minWidth: menuRect.width,
        }}
        className="max-h-[240px] overflow-y-auto bg-zinc-800 light:bg-white border border-zinc-700 light:border-slate-300 rounded-lg shadow-lg py-1 z-[10000]"
      >
        {models.map((model) => (
          <li
            key={model.id}
            role="option"
            aria-selected={isActiveGroup && model.id === selectedModelId}
          >
            <button
              type="button"
              disabled={saving}
              onClick={() => onSelect(model.id)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                isActiveGroup && model.id === selectedModelId
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
      </ul>,
      document.body
    );

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={saving}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`group border-none cursor-pointer px-2.5 py-1 flex items-center gap-1 rounded-full transition-all ${
          open || isActiveGroup
            ? "bg-zinc-700 light:bg-slate-200"
            : "hover:bg-zinc-700 light:hover:bg-slate-200"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span
          className={`text-[10px] uppercase tracking-wide opacity-60 ${
            open || isActiveGroup
              ? "text-white light:text-slate-800"
              : "text-zinc-500 light:text-slate-500 group-hover:text-white light:group-hover:text-slate-800"
          }`}
        >
          {label}
        </span>
        <span
          className={`text-xs max-w-[120px] truncate ${
            open || isActiveGroup
              ? "text-white light:text-slate-800"
              : "text-zinc-500 light:text-slate-500 group-hover:text-white light:group-hover:text-slate-800"
          }`}
        >
          {displayName}
        </span>
        <CaretDown size={12} className="shrink-0 opacity-70" />
      </button>
      {menu}
    </div>
  );
}

export default function OfferKpAnthropicModelPicker({
  workspaceSlug,
  workspace = null,
}) {
  const { t } = useTranslation();
  const [openMenu, setOpenMenu] = useState(null);
  const [selectedModel, setSelectedModel] = useState(OFFER_KP_DEFAULT_MODEL);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.localStorage.getItem("offerKp_sidebar_toggle") !== "closed"
  );
  const rootRef = useRef(null);

  const isLocalActive = isLocalModel(selectedModel);

  useEffect(() => {
    const handleToggle = (e) => setSidebarOpen(e.detail.open);
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(SIDEBAR_TOGGLE_EVENT, handleToggle);
  }, []);

  useEffect(() => {
    if (!openMenu) return undefined;
    function handlePointerDown(e) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-offer-kp-model-picker-menu]")) {
        return;
      }
      setOpenMenu(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openMenu]);

  const refresh = useCallback(async () => {
    if (workspace?.chatModel) {
      setSelectedModel(resolveOfferKpModel(workspace.chatModel));
      return;
    }
    if (!workspaceSlug) return;
    const ws = await Workspace.bySlug(workspaceSlug);
    setSelectedModel(resolveOfferKpModel(ws?.chatModel));
  }, [workspaceSlug, workspace?.chatModel]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onSaved() {
      setOpenMenu(null);
      refresh();
    }
    window.addEventListener(SAVE_LLM_SELECTOR_EVENT, onSaved);
    return () => window.removeEventListener(SAVE_LLM_SELECTOR_EVENT, onSaved);
  }, [refresh]);

  async function handleSelect(modelId) {
    if (!workspaceSlug || modelId === selectedModel) {
      setOpenMenu(null);
      return;
    }
    const meta = findOfferKpModel(modelId);
    setSaving(true);
    try {
      const { message } = await Workspace.update(workspaceSlug, {
        chatProvider: meta?.provider || "lmstudio",
        chatModel: modelId,
      });
      if (message) throw new Error(message);
      setSelectedModel(modelId);
      window.dispatchEvent(new Event(SAVE_LLM_SELECTOR_EVENT));
      setOpenMenu(null);
    } catch (err) {
      showToast(err.message || "Failed to save model", "error", { clear: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={rootRef}
      data-offer-kp-model-picker=""
      className={`hidden md:flex absolute z-50 items-center gap-1.5 transition-all duration-500 top-[56px] md:top-[62px] ${
        sidebarOpen ? "left-3" : "left-11"
      }`}
    >
      <ModelDropdown
        label="Local"
        placeholder={
          findOfferKpModel(OFFER_KP_DEFAULT_MODEL)?.name ||
          t("chat_window.select_model")
        }
        models={OFFER_KP_LOCAL_MODELS}
        selectedModelId={selectedModel}
        isActiveGroup={isLocalActive}
        open={openMenu === "local"}
        onToggle={() =>
          setOpenMenu((prev) => (prev === "local" ? null : "local"))
        }
        onSelect={handleSelect}
        saving={saving}
      />
      <ModelDropdown
        label="Cloud"
        placeholder={t("chat_window.select_model", "Выбрать")}
        models={OFFER_KP_CLOUD_MODELS}
        selectedModelId={selectedModel}
        isActiveGroup={!isLocalActive}
        open={openMenu === "cloud"}
        onToggle={() =>
          setOpenMenu((prev) => (prev === "cloud" ? null : "cloud"))
        }
        onSelect={handleSelect}
        saving={saving}
      />
    </div>
  );
}
