const llmDefaults = require("../../config/offerKp.llm.defaults");

/** Default LLM provider for offer-kp (OpenRouter). */
function getDefaultLlmProvider() {
  return process.env.LLM_PROVIDER || llmDefaults.LLM_PROVIDER || "openrouter";
}

function getDefaultLlmModel() {
  return (
    process.env.OPENROUTER_MODEL_PREF ||
    llmDefaults.OPENROUTER_MODEL_PREF ||
    "openrouter/auto"
  );
}

module.exports = { getDefaultLlmProvider, getDefaultLlmModel };
