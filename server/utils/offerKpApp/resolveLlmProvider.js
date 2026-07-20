const llmDefaults = require("../../config/offerKp.llm.defaults");
const {
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpModel,
} = require("../../config/offerKp.models");
const { offerKpLog } = require("./offerKpLog");
const openRouterEnv = require("./openRouterEnv");
const {
  shouldUseTeacherLlm,
  resolveTeacherModel,
  resolveUiModelLabel,
} = require("./teacherLlm");

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

/** OpenRouter runtime with LM Studio labels for the UI. */
function resolveOpenRouterTeacherResult({ reason = "teacher" } = {}) {
  const teacherModel = resolveTeacherModel();
  const displayModel = resolveUiModelLabel();
  const resolved = {
    provider: "openrouter",
    model: teacherModel,
    modelFallback: null,
    teacher: true,
    openRouterFallback: reason !== "teacher",
    // Public-facing label stays local so clients never see "openrouter".
    displayProvider: "lmstudio",
    displayModel,
  };
  offerKpLog("info", "Resolved LLM provider", {
    provider: "lmstudio",
    model: resolved.displayModel,
    teacher: true,
    runtimeModel: teacherModel,
    reason,
  });
  return resolved;
}

/**
 * Resolve LLM for offer-kp.
 * Teacher mode (OFFER_KP_TEACHER_LLM=1 or key present): OpenRouter under the hood;
 * UI stays LM Studio. Otherwise: LM Studio only. Prefers models with state=loaded in VRAM.
 */
function resolveLlmProviderAndModel({
  provider: _provider = null,
  model = null,
  catalog = null,
} = {}) {
  if (shouldUseTeacherLlm()) {
    return resolveOpenRouterTeacherResult({ reason: "teacher" });
  }

  // Sync path: if caller already knows LM Studio is down, prefer OpenRouter.
  if (catalog?.reachable === false && openRouterEnv.resolveOpenRouterApiKey()) {
    return resolveOpenRouterTeacherResult({
      reason: "lmstudio_unreachable",
    });
  }

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
    teacher: false,
    displayProvider: "lmstudio",
    displayModel: resolvedModel,
  };
  offerKpLog("info", "Resolved LLM provider", {
    provider: resolved.provider,
    model: resolved.model,
    fallback: resolved.modelFallback,
  });
  return resolved;
}

/**
 * LM Studio path without teacher short-circuit (used when OpenRouter/egress is down).
 */
function resolveLmStudioOnly(params = {}) {
  ensureLmStudioBasePath();

  const requestedModel =
    params.model ||
    process.env.LMSTUDIO_MODEL_PREF ||
    llmDefaults.LMSTUDIO_MODEL_PREF ||
    OFFER_KP_DEFAULT_MODEL;

  const picked = resolveRunnableModel(requestedModel, params.catalog || null);
  const resolvedModel = picked.model;
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
    teacher: false,
    openRouterFallback: false,
    displayProvider: "lmstudio",
    displayModel: resolvedModel,
  };
  offerKpLog("info", "Resolved LLM provider", {
    provider: resolved.provider,
    model: resolved.model,
    fallback: resolved.modelFallback,
    reason: "openrouter_unreachable",
  });
  return resolved;
}

/**
 * Resolves provider/model after refreshing LM Studio catalog + VRAM state.
 * If lainey is unreachable and OpenRouter key exists → OpenRouter (even when
 * OFFER_KP_TEACHER_LLM=0), so @agent / chat do not die with Connection error.
 * Inverse: teacher mode with dead egress → LM Studio when available.
 */
async function resolveLlmProviderWithFallback(params = {}) {
  await openRouterEnv.ensureOpenRouterEgressBaseUrl();

  const lmStudioModels = require("./lmStudioModels");

  if (shouldUseTeacherLlm()) {
    const orOk = await openRouterEnv.probeOpenRouterReachable(
      openRouterEnv.resolveOpenRouterBaseUrl()
    );
    if (orOk) {
      return resolveLlmProviderAndModel(params);
    }

    offerKpLog(
      "warn",
      "OpenRouter/egress unreachable — trying LM Studio fallback",
      { baseUrl: openRouterEnv.resolveOpenRouterBaseUrl() }
    );
    const catalog = await lmStudioModels.fetchLmStudioModelCatalog({
      forceRefresh: true,
    });
    if (catalog?.reachable !== false) {
      return resolveLmStudioOnly({ ...params, catalog });
    }

    offerKpLog("error", "OpenRouter and LM Studio both unreachable");
    // Keep teacher so the chat error path can show the egress hint.
    return resolveOpenRouterTeacherResult({ reason: "openrouter_unreachable" });
  }

  // Always re-probe when OpenRouter is available so a dead lainey does not
  // keep serving a stale "reachable" cache and crash @agent.
  const forceRefresh =
    params.forceRefresh === true ||
    Boolean(openRouterEnv.resolveOpenRouterApiKey());
  const catalog = await lmStudioModels.fetchLmStudioModelCatalog({
    forceRefresh,
  });

  if (
    catalog?.reachable === false &&
    openRouterEnv.resolveOpenRouterApiKey()
  ) {
    const orOk = await openRouterEnv.probeOpenRouterReachable(
      openRouterEnv.resolveOpenRouterBaseUrl()
    );
    if (orOk) {
      offerKpLog(
        "warn",
        "LM Studio unreachable — falling back to OpenRouter teacher"
      );
      return resolveOpenRouterTeacherResult({
        reason: "lmstudio_unreachable",
      });
    }
    offerKpLog(
      "error",
      "LM Studio unreachable and OpenRouter/egress also down"
    );
  }

  return resolveLlmProviderAndModel({ ...params, catalog });
}

module.exports = {
  resolveLlmProviderAndModel,
  resolveLlmProviderWithFallback,
  resolveOpenRouterTeacherResult,
  resolveLmStudioOnly,
  ensureLmStudioBasePath,
  coerceToLocalModel,
  resolveRunnableModel,
};
