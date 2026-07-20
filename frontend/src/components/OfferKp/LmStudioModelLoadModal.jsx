import { CircleNotch, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

const PHASES = {
  saving_workspace: "savingWorkspace",
  loading_vram: "loadingVram",
  already_loaded: "alreadyLoaded",
  success: "success",
  error: "error",
};

export default function LmStudioModelLoadModal({
  isOpen,
  modelName = "",
  phase = "saving_workspace",
  error = null,
  loadTimeSeconds = null,
  onClose,
}) {
  const { t } = useTranslation("offerKp");

  if (!isOpen) return null;

  const isBusy =
    phase === "saving_workspace" || phase === "loading_vram";
  const isSuccess = phase === "success" || phase === "already_loaded";
  const isError = phase === "error";

  const statusKey = PHASES[phase] || "savingWorkspace";
  const statusText = t(`modelLoad.${statusKey}`);

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="offer-kp-model-load-title"
        className="w-full max-w-md rounded-lg bg-zinc-900 light:bg-white border border-zinc-700 light:border-slate-300 shadow-xl p-6 text-zinc-100 light:text-slate-900"
      >
        <h3
          id="offer-kp-model-load-title"
          className="text-base font-semibold mb-1"
        >
          {t("modelLoad.title")}
        </h3>
        <p className="text-sm text-zinc-400 light:text-slate-500 mb-4">
          {t("modelLoad.subtitle", { model: modelName })}
        </p>

        <div className="flex items-start gap-3 rounded-md bg-zinc-800/80 light:bg-slate-50 border border-zinc-700/60 light:border-slate-200 px-3 py-3 mb-4">
          {isBusy ? (
            <CircleNotch
              size={22}
              className="shrink-0 mt-0.5 animate-spin text-primary-button"
            />
          ) : null}
          {isSuccess ? (
            <CheckCircle
              size={22}
              weight="fill"
              className="shrink-0 mt-0.5 text-[#cc785c]"
            />
          ) : null}
          {isError ? (
            <WarningCircle
              size={22}
              weight="fill"
              className="shrink-0 mt-0.5 text-red-500"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-medium">{statusText}</p>
            {isSuccess ? (
              <p className="text-xs text-zinc-400 light:text-slate-500 mt-1">
                {t("modelLoad.successDetail", { model: modelName })}
              </p>
            ) : null}
            {isSuccess && loadTimeSeconds != null && loadTimeSeconds > 0 ? (
              <p className="text-xs text-zinc-500 light:text-slate-400 mt-1">
                {t("modelLoad.loadTime", {
                  seconds: loadTimeSeconds.toFixed(1),
                })}
              </p>
            ) : null}
            {isError && error ? (
              <p className="text-xs text-red-400 light:text-red-600 mt-1 break-words">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        {!isBusy ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-md bg-primary-button text-white hover:opacity-90"
            >
              {t("modelLoad.close")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
