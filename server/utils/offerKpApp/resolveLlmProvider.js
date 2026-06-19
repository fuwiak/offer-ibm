const llmDefaults = require("../../config/offerKp.llm.defaults");
const {
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpModel,
  resolveOfferKpProvider,
  findOfferKpModel,
  isOfferKpCloudModel,
} = require("../../config/offerKp.models");
const { offerKpLog } = require("./offerKpLog");

function offerKpAllowOllama() {
  return String(process.env.OFFER_KP_ALLOW_OLLAMA || "0").trim() === "1";
}

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

function coerceToLocalModel(modelId) {
  const resolved = resolveOfferKpModel(modelId);
  if (offerKpAllowOllama() && isOfferKpCloudModel(resolved)) {
    return resolved;
  }
  if (isOfferKpCloudModel(resolved) || resolveOfferKpProvider(resolved) === "ollama") {
    return OFFER_KP_DEFAULT_MODEL;
  }
  return resolved;
}

/**
 * Resolve LLM for offer-kp. Chat/agents use LM Studio by default.
 * Ollama only when OFFER_KP_ALLOW_OLLAMA=1 and a cloud model id is selected.
 */
function resolveLlmProviderAndModel({ provider = null, model = null } = {}) {
  ensureLmStudioBasePath();

  const requestedModel =
    model ||
    process.env.LMSTUDIO_MODEL_PREF ||
    llmDefaults.LMSTUDIO_MODEL_PREF ||
    OFFER_KP_DEFAULT_MODEL;

  let resolvedModel = coerceToLocalModel(requestedModel);
  let resolvedProvider = "lmstudio";

  if (
    offerKpAllowOllama() &&
    isOfferKpCloudModel(resolvedModel) &&
    provider !== "lmstudio"
  ) {
    resolvedProvider = "ollama";
    ensureOllamaBasePath();
    process.env.OLLAMA_MODEL_PREF = resolvedModel;
  } else {
    if (requestedModel !== resolvedModel) {
      offerKpLog("warn", "Rejected Ollama model — using LM Studio", {
        requested: requestedModel,
        using: resolvedModel,
      });
    }
    process.env.LMSTUDIO_MODEL_PREF = resolvedModel;
  }

  const resolved = {
    provider: resolvedProvider,
    model: resolvedModel,
  };
  offerKpLog("info", "Resolved LLM provider", resolved);
  return resolved;
}

/** @deprecated alias */
async function resolveLlmProviderWithFallback(params = {}) {
  return resolveLlmProviderAndModel(params);
}

module.exports = {
  resolveLlmProviderAndModel,
  resolveLlmProviderWithFallback,
  ensureOllamaBasePath,
  ensureLmStudioBasePath,
  coerceToLocalModel,
  offerKpAllowOllama,
};
