const llmDefaults = require("../../config/offerKp.llm.defaults");
const { OFFER_KP_DEFAULT_MODEL } = require("../../config/offerKp.models");

/**
 * Resolve system/workspace LLM provider and model for offer-kp.
 * @param {{ provider?: string|null, model?: string|null }} params
 * @returns {{ provider: string, model: string|null }}
 */
function resolveLlmProviderAndModel({ provider = null, model = null } = {}) {
  const resolvedProvider =
    provider ||
    process.env.LLM_PROVIDER ||
    llmDefaults.LLM_PROVIDER ||
    "ollama";

  if (resolvedProvider === "ollama") {
    return {
      provider: "ollama",
      model:
        model ||
        process.env.OLLAMA_MODEL_PREF ||
        llmDefaults.OLLAMA_MODEL_PREF ||
        OFFER_KP_DEFAULT_MODEL,
    };
  }

  if (resolvedProvider === "openrouter") {
    let resolvedModel =
      model ||
      process.env.OPENROUTER_MODEL_PREF ||
      llmDefaults.OPENROUTER_MODEL_PREF ||
      "openrouter/auto";
    if (!String(resolvedModel).trim()) resolvedModel = "openrouter/auto";
    return { provider: "openrouter", model: resolvedModel };
  }

  return { provider: resolvedProvider, model: model || null };
}

module.exports = { resolveLlmProviderAndModel };
