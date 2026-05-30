const llmDefaults = require("../../config/lawyerRevizorro.llm.defaults");

/**
 * lawyer-revizorro: OpenRouter only.
 * @param {{ provider?: string|null, model?: string|null }} params
 * @returns {{ provider: string, model: string }}
 */
function resolveLlmProviderAndModel({ provider = null, model = null } = {}) {
  let resolvedModel =
    model ||
    process.env.OPENROUTER_MODEL_PREF ||
    llmDefaults.OPENROUTER_MODEL_PREF ||
    "openrouter/auto";

  if (!String(resolvedModel).trim()) resolvedModel = "openrouter/auto";

  return {
    provider: "openrouter",
    model: resolvedModel,
  };
}

module.exports = { resolveLlmProviderAndModel };
