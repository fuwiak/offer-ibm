/**
 * Teacher LLM (OpenRouter) — runtime only.
 * UI / workspace stay on LM Studio labels; flip via OFFER_KP_TEACHER_LLM.
 *
 * Default: ON when OpenRouter key is set and the flag is unset.
 * Explicit OFFER_KP_TEACHER_LLM=0 keeps local LM Studio.
 */
const { resolveOpenRouterApiKey } = require("./openRouterEnv");
const llmDefaults = require("../../config/offerKp.llm.defaults");
const { OFFER_KP_DEFAULT_MODEL } = require("../../config/offerKp.models");

const DEFAULT_TEACHER_MODEL = "qwen/qwen3-vl-235b-a22b-instruct";

function isOfferKpTeacherLlmEnabled() {
  const raw = process.env.OFFER_KP_TEACHER_LLM;
  if (raw == null || String(raw).trim() === "") {
    // Prefer OpenRouter when key exists (LM Studio often unreachable from cloud).
    return Boolean(resolveOpenRouterApiKey());
  }
  const flag = String(raw).trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

function resolveTeacherModel() {
  const pref = String(process.env.OPENROUTER_MODEL_PREF || "").trim();
  return pref || DEFAULT_TEACHER_MODEL;
}

/** Public LM Studio label for UI / chat metrics (never the OpenRouter id). */
function resolveUiModelLabel(preferred = null) {
  const fromPreferred = preferred != null ? String(preferred).trim() : "";
  if (fromPreferred && fromPreferred !== resolveTeacherModel()) {
    return fromPreferred;
  }
  return (
    String(process.env.LMSTUDIO_MODEL_PREF || "").trim() ||
    llmDefaults.LMSTUDIO_MODEL_PREF ||
    OFFER_KP_DEFAULT_MODEL
  );
}

/** True when teacher mode is on and OpenRouter key is present. */
function shouldUseTeacherLlm() {
  return isOfferKpTeacherLlmEnabled() && Boolean(resolveOpenRouterApiKey());
}

/**
 * Replace OpenRouter runtime model ids in client-facing metrics with LM Studio labels.
 * Keeps duration / tok/s; strips teacher* fields so the UI never shows the OR model name.
 */
function sanitizeMetricsForUi(metrics = {}, { displayModel = null } = {}) {
  if (!metrics || typeof metrics !== "object") return metrics;
  const provider = String(metrics.provider || "");
  const model = String(metrics.model || "");
  const teacherModel = resolveTeacherModel();
  const isOpenRouterLeak =
    metrics.teacher === true ||
    Boolean(metrics.teacherModel) ||
    /openrouter/i.test(provider) ||
    (teacherModel && model === teacherModel) ||
    shouldUseTeacherLlm();

  if (!isOpenRouterLeak) return { ...metrics };

  const next = { ...metrics };
  next.model = resolveUiModelLabel(displayModel);
  delete next.teacher;
  delete next.teacherModel;
  if (/openrouter/i.test(String(next.provider))) {
    next.provider = "LMStudioLLM";
  }
  return next;
}

/** Connection / network errors talking to LM Studio. */
function isLmStudioConnectionError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  const cause = String(
    error?.cause?.message || error?.cause?.code || ""
  ).toLowerCase();
  const code = String(error?.code || error?.cause?.code || "").toUpperCase();
  return (
    msg.includes("connection error") ||
    msg.includes("fetch failed") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket") ||
    cause.includes("other side closed") ||
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "UND_ERR_SOCKET",
    ].includes(code)
  );
}

function teacherLlmMeta() {
  if (!shouldUseTeacherLlm()) return null;
  return {
    enabled: true,
    provider: "openrouter",
    model: resolveTeacherModel(),
    displayModel: resolveUiModelLabel(),
  };
}

module.exports = {
  DEFAULT_TEACHER_MODEL,
  isOfferKpTeacherLlmEnabled,
  resolveTeacherModel,
  resolveUiModelLabel,
  shouldUseTeacherLlm,
  sanitizeMetricsForUi,
  teacherLlmMeta,
  isLmStudioConnectionError,
};
