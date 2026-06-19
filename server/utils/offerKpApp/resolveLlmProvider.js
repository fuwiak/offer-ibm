const llmDefaults = require("../../config/offerKp.llm.defaults");
const {
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpModel,
  resolveOfferKpProvider,
  findOfferKpModel,
  isOfferKpAllowedModel,
} = require("../../config/offerKp.models");
const { offerKpLog } = require("./offerKpLog");

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

function ensureLmStudioBasePath() {
  if (
    process.env.LMSTUDIO_BASE_PATH &&
    String(process.env.LMSTUDIO_BASE_PATH).trim()
  ) {
    return process.env.LMSTUDIO_BASE_PATH;
  }
  process.env.LMSTUDIO_BASE_PATH =
    llmDefaults.LMSTUDIO_BASE_PATH || "http://87.228.90.43:1234/v1";
  return process.env.LMSTUDIO_BASE_PATH;
}

/**
 * Resolve system/workspace LLM provider and model for offer-kp.
 * Provider follows model registry — stale workspace chatProvider is ignored.
 * @param {{ provider?: string|null, model?: string|null }} params
 * @returns {{ provider: string, model: string }}
 */
function resolveLlmProviderAndModel({ provider = null, model = null } = {}) {
  ensureOllamaBasePath();
  ensureLmStudioBasePath();

  let resolvedModel = resolveOfferKpModel(
    model ||
      process.env.LMSTUDIO_MODEL_PREF ||
      process.env.OLLAMA_MODEL_PREF ||
      llmDefaults.LMSTUDIO_MODEL_PREF ||
      llmDefaults.OLLAMA_MODEL_PREF ||
      OFFER_KP_DEFAULT_MODEL
  );

  // Deployment uses LM Studio — ignore stale cloud Ollama model ids in workspace.
  if (
    process.env.LLM_PROVIDER === "lmstudio" &&
    resolveOfferKpProvider(resolvedModel) === "ollama"
  ) {
    resolvedModel = OFFER_KP_DEFAULT_MODEL;
  }

  let resolvedProvider;
  if (isOfferKpAllowedModel(resolvedModel)) {
    resolvedProvider = resolveOfferKpProvider(resolvedModel);
  } else if (
    provider &&
    ["lmstudio", "ollama"].includes(String(provider).trim())
  ) {
    resolvedProvider = String(provider).trim();
  } else {
    resolvedProvider = process.env.LLM_PROVIDER === "ollama" ? "ollama" : "lmstudio";
  }

  if (resolvedProvider === "lmstudio") {
    process.env.LMSTUDIO_MODEL_PREF = resolvedModel;
  } else {
    process.env.OLLAMA_MODEL_PREF = resolvedModel;
  }

  const resolved = {
    provider: resolvedProvider,
    model: resolvedModel,
  };
  offerKpLog("info", "Resolved LLM provider", resolved);
  return resolved;
}

/** @deprecated cloud fallback removed — alias for resolveLlmProviderAndModel */
async function resolveLlmProviderWithFallback(params = {}) {
  return resolveLlmProviderAndModel(params);
}

module.exports = {
  resolveLlmProviderAndModel,
  resolveLlmProviderWithFallback,
  ensureOllamaBasePath,
  ensureLmStudioBasePath,
};
