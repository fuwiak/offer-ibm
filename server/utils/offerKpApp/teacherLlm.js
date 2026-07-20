/**
 * Teacher LLM (OpenRouter) — runtime only.
 * UI / workspace stay on LM Studio labels; flip via OFFER_KP_TEACHER_LLM.
 *
 * Default: ON when OpenRouter key is set and the flag is unset.
 * Explicit OFFER_KP_TEACHER_LLM=0 keeps local LM Studio.
 */
const { resolveOpenRouterApiKey } = require("./openRouterEnv");

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

/** True when teacher mode is on and OpenRouter key is present. */
function shouldUseTeacherLlm() {
  return isOfferKpTeacherLlmEnabled() && Boolean(resolveOpenRouterApiKey());
}

/** Connection / network errors talking to LM Studio. */
function isLmStudioConnectionError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  const cause = String(error?.cause?.message || error?.cause?.code || "").toLowerCase();
  const code = String(error?.code || error?.cause?.code || "").toUpperCase();
  return (
    msg.includes("connection error") ||
    msg.includes("fetch failed") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket") ||
    cause.includes("other side closed") ||
    ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "UND_ERR_SOCKET"].includes(
      code
    )
  );
}

function teacherLlmMeta() {
  if (!shouldUseTeacherLlm()) return null;
  return {
    enabled: true,
    provider: "openrouter",
    model: resolveTeacherModel(),
  };
}

module.exports = {
  DEFAULT_TEACHER_MODEL,
  isOfferKpTeacherLlmEnabled,
  resolveTeacherModel,
  shouldUseTeacherLlm,
  teacherLlmMeta,
  isLmStudioConnectionError,
};
