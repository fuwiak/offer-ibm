import { Stop } from "@phosphor-icons/react";
import { ABORT_STREAM_EVENT } from "@/utils/chat";
import { Tooltip } from "react-tooltip";
import { useTranslation } from "react-i18next";

export default function StopGenerationButton({
  offerKpHome = false,
  showLabel = false,
}) {
  const { t } = useTranslation();
  const label = t("chat_window.stop_generating");

  function emitHaltEvent() {
    window.dispatchEvent(new CustomEvent(ABORT_STREAM_EVENT));
  }

  return (
    <>
      <button
        type="button"
        onClick={emitHaltEvent}
        data-tooltip-id={showLabel ? undefined : "stop-generation-button"}
        data-tooltip-content={label}
        className={
          offerKpHome
            ? `offerKp-prompt-send-btn offerKp-prompt-send-btn--stop${
                showLabel ? " offerKp-prompt-send-btn--with-label" : ""
              }`
            : "border-none inline-flex justify-center items-center rounded-full cursor-pointer w-8 h-8 bg-white light:bg-slate-800 hover:opacity-80 transition-opacity"
        }
        aria-label={label}
      >
        <Stop
          size={showLabel ? 16 : 18}
          weight="fill"
          className={
            offerKpHome ? "offerKp-stop-generation-icon" : "text-zinc-800 light:text-white"
          }
        />
        {showLabel ? (
          <span className="offerKp-stop-generation-label">{label}</span>
        ) : null}
      </button>
      {!showLabel ? (
        <Tooltip
          id="stop-generation-button"
          place="bottom"
          delayShow={300}
          className="tooltip !text-xs z-99"
        />
      ) : null}
    </>
  );
}
