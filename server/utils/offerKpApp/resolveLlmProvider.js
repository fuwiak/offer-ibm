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

function resolveRunnableModel(requestedModel, catalog = null) {
  const {
    pickRunnableLmStudioModel,
    getCachedLmStudioModelIds,
    getCachedLoadedLmStudioModelIds,
    getCachedLmStudioModelState,
  } = require("./lmStudioModels");

  const catalogSnapshot = catalog || {
    ids: getCachedLmStudioModelIds(),
    loadedIds: getCachedLoadedLmStudioModelIds(),
    stateById: requestedModel
      ? {
          [requestedModel]: getCachedLmStudioModelState(requestedModel),
        }
      : {},
  };

  return pickRunnableLmStudioModel(requestedModel, catalogSnapshot);
}

/**
 * Resolve LLM for offer-kp. Chat/agents use LM Studio only.
 * Uses the user-selected catalog model; LM Studio auto-loads on first request.
 */
function resolveLlmProviderAndModel({
  provider: _provider = null,
  model = null,
  catalog = null,
} = {}) {
  ensureLmStudioBasePath();

  const requestedModel =
    model ||
    process.env.LMSTUDIO_MODEL_PREF ||
    llmDefaults.LMSTUDIO_MODEL_PREF ||
    OFFER_KP_DEFAULT_MODEL;

  const picked = resolveRunnableModel(requestedModel, catalog);
  const resolvedModel = picked.model;

  if (picked.fallback && picked.requested) {
    offerKpLog("warn", "LM Studio model not loaded — using fallback", {
      requested: picked.requested,
      requestedState: catalog?.stateById?.[picked.requested] || null,
      using: resolvedModel,
      loaded: catalog?.loadedIds || [],
      reason: picked.reason,
    });
  } else if (requestedModel !== resolvedModel) {
    offerKpLog("warn", "Rejected unknown model — using LM Studio default", {
      requested: requestedModel,
      using: resolvedModel,
    });
  }

  const resolved = {
    provider: "lmstudio",
    model: resolvedModel,
    modelFallback: picked.fallback
      ? {
          from: picked.requested,
          to: resolvedModel,
          reason: picked.reason,
        }
      : null,
  };
  offerKpLog("info", "Resolved LLM provider", {
    provider: resolved.provider,
    model: resolved.model,
    fallback: resolved.modelFallback,
  });
  return resolved;
}

/** Resolves provider/model after refreshing LM Studio catalog + VRAM state. */
async function resolveLlmProviderWithFallback(params = {}) {
  const { fetchLmStudioModelCatalog } = require("./lmStudioModels");
  const catalog = await fetchLmStudioModelCatalog({
    forceRefresh: params.forceRefresh,
  });
  return resolveLlmProviderAndModel({ ...params, catalog });
}

module.exports = {
  resolveLlmProviderAndModel,
  resolveLlmProviderWithFallback,
  ensureLmStudioBasePath,
  coerceToLocalModel,
  resolveRunnableModel,
};
