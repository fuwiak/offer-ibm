const llmDefaults = require("../../config/offerKp.llm.defaults");
const {
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpModel,
} = require("../../config/offerKp.models");
const { offerKpLog } = require("./offerKpLog");

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

/** Maps legacy cloud/Ollama model ids to an allowed local model. */
function coerceToLocalModel(modelId, liveIds = null) {
  let catalogIds = liveIds;
  if (!Array.isArray(catalogIds) || catalogIds.length === 0) {
    try {
      const { getCachedLmStudioModelIds } = require("./lmStudioModels");
      catalogIds = getCachedLmStudioModelIds();
    } catch {
      catalogIds = [];
    }
  }
  return resolveOfferKpModel(modelId, catalogIds.length ? catalogIds : null);
}

/**
 * Resolve LLM for offer-kp. Chat/agents use LM Studio only.
 */
function resolveLlmProviderAndModel({
  provider: _provider = null,
  model = null,
} = {}) {
  ensureLmStudioBasePath();

  const requestedModel =
    model ||
    process.env.LMSTUDIO_MODEL_PREF ||
    llmDefaults.LMSTUDIO_MODEL_PREF ||
    OFFER_KP_DEFAULT_MODEL;

  const resolvedModel = coerceToLocalModel(requestedModel);

  if (requestedModel !== resolvedModel) {
    offerKpLog("warn", "Rejected unknown model — using LM Studio default", {
      requested: requestedModel,
      using: resolvedModel,
    });
  }

  const resolved = {
    provider: "lmstudio",
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
  ensureLmStudioBasePath,
  coerceToLocalModel,
};
