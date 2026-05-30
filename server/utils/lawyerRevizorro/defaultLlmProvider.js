const llmDefaults = require("../../config/lawyerRevizorro.llm.defaults");

/** Default LLM provider for lawyer-revizorro (OpenRouter). */
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
