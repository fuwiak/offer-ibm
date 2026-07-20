/**
 * Teacher LLM (OpenRouter) — runtime only.
 * UI / workspace stay on LM Studio labels; flip via OFFER_KP_TEACHER_LLM.
 */
const { resolveOpenRouterApiKey } = require("./openRouterEnv");

const DEFAULT_TEACHER_MODEL = "qwen/qwen3-vl-235b-a22b-instruct";

function isOfferKpTeacherLlmEnabled() {
  const flag = String(process.env.OFFER_KP_TEACHER_LLM ?? "0")
    .trim()
    .toLowerCase();
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
};
