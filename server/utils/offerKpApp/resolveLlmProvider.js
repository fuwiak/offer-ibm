const llmDefaults = require("../../config/offerKp.llm.defaults");
const {
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpModel,
} = require("../../config/offerKp.models");

function ensureOllamaBasePath() {
  if (
    process.env.OLLAMA_BASE_PATH &&
    String(process.env.OLLAMA_BASE_PATH).trim()
  ) {
    return process.env.OLLAMA_BASE_PATH;
  }
  process.env.OLLAMA_BASE_PATH =
    llmDefaults.OLLAMA_BASE_PATH || "http://212.41.6.162:11434";
  return process.env.OLLAMA_BASE_PATH;
}

/**
 * Resolve system/workspace LLM provider and model for offer-kp.
 * Agents and chat always use Ollama with an allowed local model id.
 * @param {{ provider?: string|null, model?: string|null }} params
 * @returns {{ provider: string, model: string }}
 */
function resolveLlmProviderAndModel({ provider = null, model = null } = {}) {
  ensureOllamaBasePath();

  const resolvedModel = resolveOfferKpModel(
    model ||
      process.env.OLLAMA_MODEL_PREF ||
      llmDefaults.OLLAMA_MODEL_PREF ||
      OFFER_KP_DEFAULT_MODEL
  );

  return {
    provider: "ollama",
    model: resolvedModel,
  };
}

module.exports = { resolveLlmProviderAndModel, ensureOllamaBasePath };
