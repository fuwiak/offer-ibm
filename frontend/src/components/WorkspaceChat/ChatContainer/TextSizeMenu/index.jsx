import { useState, useRef, useEffect, useMemo } from "react";
import { SlidersHorizontal } from "@phosphor-icons/react";
import useLoginMode from "@/hooks/useLoginMode";
import { useTranslation } from "react-i18next";
import { isMobile } from "react-device-detect";
import { useLocation, useParams } from "react-router-dom";
import { shouldUseOfferKpLayout } from "@/utils/offerKp/detectOfferKpMode";

function getTextSizes(t) {
  return [
    { key: "small", label: t("chat_window.small"), textClass: "text-xs" },
    { key: "normal", label: t("chat_window.normal"), textClass: "text-sm" },
    { key: "large", label: t("chat_window.large"), textClass: "text-base" },
  ];
}

export default function TextSizeMenu({ embedded = false }) {
  const { t } = useTranslation();
  const TEXT_SIZES = useMemo(() => getTextSizes(t), [t]);
  const { pathname } = useLocation();
  const { slug } = useParams();
  const mode = useLoginMode();
  const offerKpMode = shouldUseOfferKpLayout({ pathname, workspaceSlug: slug });
  const [showMenu, setShowMenu] = useState(false);
  const [selectedSize, setSelectedSize] = useState(
    () => window.localStorage.getItem("offerKp_text_size") || "normal"
  );
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!showMenu) return;
    function handleClickOutside(e) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  function handleTextSizeChange(size) {
    setSelectedSize(size);
    window.localStorage.setItem("offerKp_text_size", size);
    window.dispatchEvent(new CustomEvent("textSizeChange", { detail: size }));
  }

  if (isMobile) return null;
  if (offerKpMode && !embedded) return null;

  const hasUserIcon = mode !== null;

  const menu = showMenu && (
    <div
      ref={menuRef}
      className={`absolute right-0 top-[calc(100%+6px)] bg-zinc-800 light:bg-white border border-zinc-700 light:border-slate-300 rounded-lg p-3 w-[200px] flex flex-col gap-1 shadow-lg z-[60] ${
        embedded ? "" : ""
      }`}
    >
      <p className="text-[10px] font-medium text-zinc-400 light:text-slate-500 px-2 mb-0.5">
        {t("chat_window.text_size_label")}
      </p>
      {TEXT_SIZES.map(({ key, label, textClass }) => (
        <div
          key={key}
          onClick={() => handleTextSizeChange(key)}
          className={`flex items-center px-2 py-1 rounded cursor-pointer ${
            selectedSize === key
              ? "bg-zinc-700 light:bg-slate-200"
              : "hover:bg-zinc-700/50 light:hover:bg-slate-100"
          }`}
        >
          <span className={`${textClass} text-white light:text-slate-900`}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );

  const button = (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => setShowMenu(!showMenu)}
      className={`group border-none cursor-pointer flex items-center justify-center w-[35px] h-[35px] rounded-full transition-all shrink-0 ${
        embedded
          ? showMenu
            ? "bg-theme-action-menu-item-hover"
            : "bg-transparent hover:bg-theme-action-menu-item-hover"
          : showMenu
            ? "bg-zinc-700 light:bg-slate-200"
            : "hover:bg-zinc-700 light:hover:bg-slate-200"
      }`}
      aria-label={t("chat_window.text_size_label")}
      aria-expanded={showMenu}
    >
      <SlidersHorizontal
        size={18}
        className={
          embedded
            ? "text-theme-text-primary"
            : showMenu
              ? "text-white light:text-slate-800"
              : "text-zinc-300 light:text-slate-600 group-hover:text-white light:group-hover:text-slate-800"
        }
      />
    </button>
  );

  if (embedded) {
    return (
      <div className="relative shrink-0">
        {button}
        {menu}
      </div>
    );
  }

  return (
    <div
      className={`absolute z-30 ${offerKpMode ? "top-[56px] md:top-[62px]" : "top-3 md:top-5"} ${
        offerKpMode && hasUserIcon
          ? "right-[108px] md:right-[124px]"
          : hasUserIcon
            ? "right-[55px] md:right-[67px]"
            : "right-4 md:right-6"
      }`}
    >
      {button}
      {menu}
    </div>
  );
}
