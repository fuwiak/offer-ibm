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
 * Default: LM Studio only. OpenRouter (teacher / LM-down fallback) requires
 * OFFER_KP_OPENROUTER=1 plus OFFER_KP_TEACHER_LLM=1 (or key for fallback).
 * Prefers models with state=loaded in VRAM.
 */
function resolveLlmProviderAndModel({
  provider: _provider = null,
  model = null,
  catalog = null,
} = {}) {
  if (shouldUseTeacherLlm()) {
    // Sync callers (searchAgent / askAgent / quoteIntentJudge) never probed.
    // If egress is known-dead (or never probed while pointing at :8787), do not
    // construct OpenRouterLLM — that only produces Connection error.
    if (!openRouterEnv.isOpenRouterLikelyReachable()) {
      return resolveLmStudioOnly({
        model,
        catalog,
        fallbackReason: "openrouter_unreachable",
      });
    }
    return resolveOpenRouterTeacherResult({ reason: "teacher" });
  }

  // Sync path: if caller already knows LM Studio is down, prefer OpenRouter
  // only when OpenRouter is explicitly enabled.
  if (
    catalog?.reachable === false &&
    openRouterEnv.isOpenRouterEnabled() &&
    openRouterEnv.resolveOpenRouterApiKey()
  ) {
    if (openRouterEnv.isOpenRouterLikelyReachable()) {
      return resolveOpenRouterTeacherResult({
        reason: "lmstudio_unreachable",
      });
    }
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
  const fallbackReason = params.fallbackReason || "openrouter_unreachable";
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
    fallbackReason,
    displayProvider: "lmstudio",
    displayModel: resolvedModel,
    // Marker so getLLMProvider does not re-run teacher short-circuit.
    useResolved: true,
  };
  const msg = `OpenRouter/egress недоступен → fallback на LM Studio (${resolvedModel})`;
  console.warn(`\x1b[33m[OfferKP-LLM]\x1b[0m ${msg}`);
  offerKpLog("warn", msg, {
    provider: resolved.provider,
    model: resolved.model,
    fallback: resolved.modelFallback,
    reason: fallbackReason,
    openRouterBaseUrl: openRouterEnv.resolveOpenRouterBaseUrl(),
  });
  return resolved;
}

/**
 * Resolves provider/model after refreshing LM Studio catalog + VRAM state.
 * OpenRouter fallback only when OFFER_KP_OPENROUTER=1 and LM Studio is down.
 * Inverse: teacher mode with dead egress → LM Studio when available.
 */
async function resolveLlmProviderWithFallback(params = {}) {
  if (openRouterEnv.isOpenRouterEnabled()) {
    await openRouterEnv.ensureOpenRouterEgressBaseUrl();
  }

  const lmStudioModels = require("./lmStudioModels");

  if (shouldUseTeacherLlm()) {
    const orOk = await openRouterEnv.probeOpenRouterReachable(
      openRouterEnv.resolveOpenRouterBaseUrl()
    );
    if (orOk) {
      return resolveLlmProviderAndModel(params);
    }

    // Never route chat to a known-dead OpenRouter/egress — that only produces
    // "Connection error" with no chance of recovery. Prefer LM Studio even if
    // the catalog probe is soft-failing; the actual request will surface truth.
    offerKpLog(
      "warn",
      "OpenRouter/egress unreachable — using LM Studio (do not call OpenRouter)",
      { baseUrl: openRouterEnv.resolveOpenRouterBaseUrl() }
    );
    const catalog = await lmStudioModels.fetchLmStudioModelCatalog({
      forceRefresh: true,
    });
    return resolveLmStudioOnly({
      ...params,
      catalog,
      fallbackReason: "openrouter_unreachable",
    });
  }

  // Re-probe LM Studio; OpenRouter fallback only when explicitly enabled.
  const forceRefresh =
    params.forceRefresh === true ||
    (openRouterEnv.isOpenRouterEnabled() &&
      Boolean(openRouterEnv.resolveOpenRouterApiKey()));
  const catalog = await lmStudioModels.fetchLmStudioModelCatalog({
    forceRefresh,
  });

  if (
    catalog?.reachable === false &&
    openRouterEnv.isOpenRouterEnabled() &&
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
    return {
      ...resolveLmStudioOnly({
        ...params,
        catalog,
        fallbackReason: "lmstudio_and_openrouter_unreachable",
      }),
      lmStudioReachable: false,
      llmUnreachable: true,
    };
  }

  if (catalog?.reachable === false) {
    offerKpLog("error", "LM Studio unreachable (OpenRouter disabled)");
    return {
      ...resolveLmStudioOnly({
        ...params,
        catalog,
        fallbackReason: "lmstudio_unreachable",
      }),
      lmStudioReachable: false,
      llmUnreachable: true,
    };
  }

  const resolved = resolveLlmProviderAndModel({ ...params, catalog });
  return {
    ...resolved,
    lmStudioReachable: catalog?.reachable !== false,
    llmUnreachable: catalog?.reachable === false && resolved.provider === "lmstudio",
  };
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
