const llmDefaults = require("../../config/offerKp.llm.defaults");
const {
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpModel,
  isLmStudioAuxiliaryModelId,
} = require("../../config/offerKp.models");
const { offerKpLog } = require("./offerKpLog");

const LMSTUDIO_MODELS_CACHE_MS = Number(
  process.env.LMSTUDIO_MODELS_CACHE_MS || 60_000
);

/** @type {{ fetchedAt: number, ids: string[], models: object[], loadedIds: string[], stateById: Record<string, string> } | null} */
let catalogCache = null;

function lmStudioBaseUrl() {
  return (
    process.env.LMSTUDIO_BASE_PATH ||
    llmDefaults.LMSTUDIO_BASE_PATH ||
    llmDefaults.OFFER_KP_LMSTUDIO_HOST ||
    "http://87.228.90.43:1234/v1"
  );
}

function isLmStudioChatModelId(modelId) {
  const id = String(modelId || "")
    .trim()
    .toLowerCase();
  if (!id) return false;
  if (id.includes("embed")) return false;
  if (id.includes("whisper")) return false;
  if (isLmStudioAuxiliaryModelId(id)) return false;
  return true;
}

function isLmStudioLoadedState(state) {
  return String(state || "").toLowerCase() === "loaded";
}

async function fetchLmStudioRuntimeStates(basePath, apiKey = null) {
  const { parseLMStudioBasePath } = require("../AiProviders/lmStudio");
  const endpoint = new URL(parseLMStudioBasePath(basePath));
  endpoint.pathname = "/api/v0/models";

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const res = await fetch(endpoint.toString(), { headers });
    if (!res.ok) {
      offerKpLog("warn", "LM Studio /api/v0/models fetch failed", {
        status: res.status,
        statusText: res.statusText,
      });
      return { loadedIds: [], stateById: {}, loadedContextById: {} };
    }

    const body = await res.json();
    const rows = Array.isArray(body?.data) ? body.data : [];
    const stateById = {};
    const loadedContextById = {};
    const loadedIds = [];

    for (const row of rows) {
      const id = String(row?.id || "").trim();
      if (!id || !isLmStudioChatModelId(id)) continue;
      const state = String(row?.state || "unknown").toLowerCase();
      stateById[id] = state;
      const loadedCtx = Number(row?.loaded_context_length);
      if (Number.isFinite(loadedCtx) && loadedCtx > 0) {
        loadedContextById[id] = loadedCtx;
      }
      if (isLmStudioLoadedState(state)) loadedIds.push(id);
    }

    return { loadedIds, stateById, loadedContextById };
  } catch (error) {
    offerKpLog("warn", "LM Studio runtime state fetch error", {
      error: error?.message || String(error),
    });
    return { loadedIds: [], stateById: {}, loadedContextById: {} };
  }
}

/**
 * Pick a model that LM Studio can run now (state=loaded in VRAM).
 * @param {string} preferredId
 * @param {{ ids?: string[], loadedIds?: string[], stateById?: Record<string, string> }} [catalog]
 * @returns {{ model: string, fallback: boolean, requested?: string, reason?: string }}
 */
function pickRunnableLmStudioModel(preferredId, catalog = {}) {
  const preferred = String(preferredId || "").trim();
  const ids = catalog.ids || [];
  const loadedIds = catalog.loadedIds || [];

  if (preferred && loadedIds.includes(preferred)) {
    return { model: preferred, fallback: false };
  }

  const chain = [OFFER_KP_DEFAULT_MODEL, preferred, ...loadedIds, ...ids];
  const seen = new Set();
  for (const candidate of chain) {
    const id = String(candidate || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (loadedIds.includes(id)) {
      const fallback = id !== preferred;
      return {
        model: id,
        fallback,
        requested: preferred || undefined,
        reason: fallback ? "model_not_loaded" : undefined,
      };
    }
  }

  if (preferred && ids.includes(preferred)) {
    return {
      model: preferred,
      fallback: false,
      reason: loadedIds.length ? "no_loaded_models" : "runtime_unknown",
    };
  }

  const coerced = resolveOfferKpModel(preferred, ids.length ? ids : null);
  return {
    model: coerced,
    fallback: coerced !== preferred,
    requested: preferred || undefined,
    reason: loadedIds.length ? "model_not_in_catalog" : "runtime_unknown",
  };
}

function isLmStudioModelLoadError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  return (
    msg.includes("failed to load model") ||
    (msg.includes("400") && msg.includes("load model"))
  );
}

/**
 * Pick a VRAM-loaded model when the requested one cannot be loaded.
 * @param {string} failedModelId
 * @param {{ ids?: string[], loadedIds?: string[] }} [catalog]
 */
function pickLoadedLmStudioFallback(failedModelId, catalog = {}) {
  const picked = pickRunnableLmStudioModel(failedModelId, catalog);
  const failed = String(failedModelId || "").trim();
  if (picked.model && picked.model !== failed) return picked;
  const loadedIds = catalog.loadedIds || [];
  const alt = loadedIds.find((id) => id && id !== failed);
  if (!alt) return null;
  return {
    model: alt,
    fallback: true,
    requested: failed,
    reason: "model_not_loaded",
  };
}

/**
 * GET {base}/models — OpenAI-compatible LM Studio catalog + VRAM load state.
 * @param {{ basePath?: string, apiKey?: string, forceRefresh?: boolean }} [opts]
 */
async function fetchLmStudioModelCatalog(opts = {}) {
  const now = Date.now();
  if (
    !opts.forceRefresh &&
    catalogCache &&
    now - catalogCache.fetchedAt < LMSTUDIO_MODELS_CACHE_MS
  ) {
    return {
      ...catalogCache,
      reachable: catalogCache.reachable !== false,
      fetchError: Boolean(catalogCache.fetchError),
    };
  }

  const basePath = opts.basePath || lmStudioBaseUrl();
  const apiKey =
    opts.apiKey === true
      ? process.env.LMSTUDIO_AUTH_TOKEN
      : opts.apiKey || process.env.LMSTUDIO_AUTH_TOKEN || null;

  const { OpenAI: OpenAIApi } = require("openai");
  const { parseLMStudioBasePath } = require("../AiProviders/lmStudio");
  const LMSTUDIO_MODELS_TIMEOUT_MS = 15_000;

  const openai = new OpenAIApi({
    baseURL: parseLMStudioBasePath(basePath),
    apiKey: apiKey || null,
    timeout: LMSTUDIO_MODELS_TIMEOUT_MS,
  });

  const raw = await openai.models
    .list()
    .then((results) => results.data || [])
    .catch((e) => {
      // Connection refused / timeout is expected when lainey is down or
      // teacher/OpenRouter is the active runtime — keep boot logs quiet.
      const detail = e?.cause?.code || e?.message || String(e);
      offerKpLog("warn", "LM Studio /v1/models unreachable", {
        basePath,
        error: detail,
      });
      return null;
    });

  if (!raw) {
    // Do not reuse a stale successful cache as "reachable" — callers must
    // fall back to OpenRouter when lainey is down.
    return {
      fetchedAt: now,
      ids: [],
      models: [],
      loadedIds: [],
      stateById: {},
      reachable: false,
      fetchError: true,
    };
  }

  const chatModels = raw.filter((m) => isLmStudioChatModelId(m?.id));
  const ids = chatModels.map((m) => m.id);
  const { loadedIds, stateById } = await fetchLmStudioRuntimeStates(
    basePath,
    apiKey
  );

  catalogCache = {
    fetchedAt: now,
    ids,
    models: chatModels.map((m) => ({
      ...m,
      loadState: stateById[m.id] || "unknown",
    })),
    loadedIds,
    stateById,
    reachable: true,
    fetchError: false,
  };

  offerKpLog("info", "LM Studio model catalog refreshed", {
    basePath,
    count: ids.length,
    loaded: loadedIds,
    ids,
  });

  return catalogCache;
}

function getCachedLmStudioModelIds() {
  return catalogCache?.ids ? [...catalogCache.ids] : [];
}

function getCachedLoadedLmStudioModelIds() {
  return catalogCache?.loadedIds ? [...catalogCache.loadedIds] : [];
}

function getCachedLmStudioModelState(modelId) {
  const id = String(modelId || "").trim();
  return catalogCache?.stateById?.[id] || null;
}

function invalidateLmStudioModelCatalogCache() {
  catalogCache = null;
}

function lmStudioApiOrigin(basePath = lmStudioBaseUrl()) {
  const { parseLMStudioBasePath } = require("../AiProviders/lmStudio");
  return new URL(parseLMStudioBasePath(basePath)).origin;
}

function lmStudioV1Url(basePath, pathname) {
  const url = new URL(lmStudioApiOrigin(basePath));
  url.pathname = pathname;
  return url;
}

function lmStudioAuthHeaders(apiKey = null) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

/**
 * Unload a model instance from LM Studio VRAM.
 * @param {string} instanceId
 * @param {{ basePath?: string, apiKey?: string }} [opts]
 */
async function unloadLmStudioModel(instanceId, opts = {}) {
  const id = String(instanceId || "").trim();
  if (!id) return false;

  const basePath = opts.basePath || lmStudioBaseUrl();
  const apiKey =
    opts.apiKey === true
      ? process.env.LMSTUDIO_AUTH_TOKEN
      : opts.apiKey || process.env.LMSTUDIO_AUTH_TOKEN || null;

  const response = await fetch(
    lmStudioV1Url(basePath, "/api/v1/models/unload").toString(),
    {
      method: "POST",
      headers: lmStudioAuthHeaders(apiKey),
      body: JSON.stringify({ instance_id: id }),
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail =
      body?.error?.message ||
      body?.message ||
      body?.error ||
      response.statusText ||
      "LM Studio model unload failed";
    throw new Error(String(detail));
  }

  return true;
}

/**
 * Unload every model currently in LM Studio VRAM.
 * @param {{ basePath?: string, apiKey?: string }} [opts]
 */
async function unloadAllLoadedLmStudioModels(opts = {}) {
  const basePath = opts.basePath || lmStudioBaseUrl();
  const apiKey =
    opts.apiKey === true
      ? process.env.LMSTUDIO_AUTH_TOKEN
      : opts.apiKey || process.env.LMSTUDIO_AUTH_TOKEN || null;

  const { loadedIds } = await fetchLmStudioRuntimeStates(basePath, apiKey);
  if (!loadedIds.length) return [];

  for (const loadedId of loadedIds) {
    await unloadLmStudioModel(loadedId, { basePath, apiKey });
    offerKpLog("info", "Unloaded LM Studio model before switch", {
      unloaded: loadedId,
    });
  }

  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Number(process.env.LMSTUDIO_LMS_SWITCH_SLEEP_MS || 2000)
    )
  );
  return loadedIds;
}

/**
 * Free VRAM by unloading every loaded chat model except the target.
 * @param {string} targetModelId
 * @param {{ basePath?: string, apiKey?: string }} [opts]
 */
async function unloadOtherLoadedLmStudioModels(targetModelId, opts = {}) {
  const target = String(targetModelId || "").trim();
  const basePath = opts.basePath || lmStudioBaseUrl();
  const apiKey =
    opts.apiKey === true
      ? process.env.LMSTUDIO_AUTH_TOKEN
      : opts.apiKey || process.env.LMSTUDIO_AUTH_TOKEN || null;

  const { loadedIds } = await fetchLmStudioRuntimeStates(basePath, apiKey);
  const toUnload = loadedIds.filter(
    (loadedId) => loadedId && loadedId !== target
  );
  if (!toUnload.length) return [];

  for (const loadedId of toUnload) {
    await unloadLmStudioModel(loadedId, { basePath, apiKey });
    offerKpLog("info", "Unloaded LM Studio model before switch", {
      unloaded: loadedId,
      target,
    });
  }

  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Number(process.env.LMSTUDIO_LMS_SWITCH_SLEEP_MS || 2000)
    )
  );
  return toUnload;
}

async function loadLmStudioModelViaRest(modelId, opts = {}) {
  const id = String(modelId || "").trim();
  const basePath = opts.basePath || lmStudioBaseUrl();
  const apiKey =
    opts.apiKey === true
      ? process.env.LMSTUDIO_AUTH_TOKEN
      : opts.apiKey || process.env.LMSTUDIO_AUTH_TOKEN || null;
  const contextLength =
    opts.contextLength ||
    Number(process.env.LMSTUDIO_MODEL_TOKEN_LIMIT) ||
    32768;
  const { resolveLmStudioLoadProfile } = require("./lmStudioCli");
  const profile = resolveLmStudioLoadProfile(id, {
    contextLength,
    gpu: opts.gpu,
  });

  const unloadedIds = await unloadAllLoadedLmStudioModels({ basePath, apiKey });

  const loadUrl = lmStudioV1Url(basePath, "/api/v1/models/load");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);

  let response;
  try {
    response = await fetch(loadUrl.toString(), {
      method: "POST",
      headers: lmStudioAuthHeaders(apiKey),
      body: JSON.stringify({
        model: id,
        context_length: profile.contextLength,
        flash_attention: true,
        offload_kv_cache_to_gpu: profile.offloadKvCacheToGpu,
        echo_load_config: true,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("LM Studio model load timed out after 5 minutes");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      body?.error?.message ||
      body?.message ||
      body?.error ||
      response.statusText ||
      "LM Studio model load failed";
    throw new Error(String(detail));
  }

  return {
    success: true,
    model: id,
    status: body?.status || "loaded",
    alreadyLoaded: false,
    unloadedIds,
    loadTimeSeconds: Number(body?.load_time_seconds) || null,
    contextLength: body?.load_config?.context_length || profile.contextLength,
    instanceId: body?.instance_id || id,
    via: "rest",
  };
}

/**
 * Load a model into LM Studio VRAM via POST /api/v1/models/load.
 * @param {string} modelId
 * @param {{ basePath?: string, apiKey?: string, contextLength?: number, force?: boolean }} [opts]
 */
async function loadLmStudioModel(modelId, opts = {}) {
  const id = String(modelId || "").trim();
  if (!id) throw new Error("modelId is required");

  const basePath = opts.basePath || lmStudioBaseUrl();
  const apiKey =
    opts.apiKey === true
      ? process.env.LMSTUDIO_AUTH_TOKEN
      : opts.apiKey || process.env.LMSTUDIO_AUTH_TOKEN || null;

  const {
    loadLmStudioModelViaCli,
    resolveLmStudioLoadProfile,
  } = require("./lmStudioCli");
  const profile = resolveLmStudioLoadProfile(id, {
    contextLength: opts.contextLength,
    gpu: opts.gpu,
  });
  const contextLength = profile.contextLength;

  if (!opts.force) {
    const { stateById, loadedContextById } = await fetchLmStudioRuntimeStates(
      basePath,
      apiKey
    );
    const loadedCtx = Number(loadedContextById[id]) || 0;
    if (isLmStudioLoadedState(stateById[id]) && loadedCtx >= contextLength) {
      invalidateLmStudioModelCatalogCache();
      await fetchLmStudioModelCatalog({ basePath, apiKey, forceRefresh: true });
      return {
        success: true,
        model: id,
        status: "loaded",
        alreadyLoaded: true,
        loadTimeSeconds: 0,
        contextLength: loadedCtx,
        via: "cached",
      };
    }
    if (isLmStudioLoadedState(stateById[id]) && loadedCtx < contextLength) {
      offerKpLog("info", "Reloading LM Studio model with larger context", {
        model: id,
        loadedContext: loadedCtx,
        targetContext: contextLength,
      });
    }
  }

  let result = null;

  if (opts.preferCli !== false) {
    try {
      result = await loadLmStudioModelViaCli(id, {
        contextLength: profile.contextLength,
        gpu: profile.gpu,
        sshTarget: opts.sshTarget,
      });
    } catch (error) {
      offerKpLog("warn", "LM Studio CLI load failed, falling back to REST", {
        model: id,
        error: error?.message || String(error),
      });
    }
  }

  if (!result) {
    result = await loadLmStudioModelViaRest(id, {
      basePath,
      apiKey,
      contextLength: profile.contextLength,
      gpu: profile.gpu,
    });
  }

  invalidateLmStudioModelCatalogCache();
  await fetchLmStudioModelCatalog({ basePath, apiKey, forceRefresh: true });

  offerKpLog("info", "LM Studio model loaded into VRAM", {
    model: id,
    via: result.via,
    unloadedIds: result.unloadedIds,
    loadTimeSeconds: result.loadTimeSeconds,
    contextLength: result.contextLength,
  });

  return result;
}

/**
 * @param {"chat"|"ocr"|"vision"|"agent"} task
 * @param {{ workspace?: object, modelId?: string }} [opts]
 */
async function loadLmStudioModelForTask(task, opts = {}) {
  const {
    resolveOfferKpOcrModel,
    resolveOfferKpChatModel,
    OFFER_KP_DEFAULT_MODEL,
  } = require("../../config/offerKp.models");
  const {
    resolvePipelineVisionModel,
    resolvePipelineAgentModel,
    resolvePipelineAgentContext,
  } = require("../offerKp/offerKpModelPipeline");

  const t = String(task || "").toLowerCase();
  let modelId = opts.modelId;
  let contextLength = opts.contextLength;

  if (!modelId) {
    if (t === "ocr" || t === "vision" || t === "eyes") {
      modelId = resolvePipelineVisionModel() || resolveOfferKpOcrModel();
    } else if (t === "agent" || t === "brain") {
      modelId = resolvePipelineAgentModel();
      contextLength = contextLength || resolvePipelineAgentContext(modelId);
    } else {
      modelId =
        resolveOfferKpChatModel(opts.workspace) || OFFER_KP_DEFAULT_MODEL;
    }
  }

  return loadLmStudioModel(modelId, {
    ...opts,
    contextLength,
    force: opts.force !== false,
  });
}

module.exports = {
  lmStudioBaseUrl,
  isLmStudioChatModelId,
  isLmStudioLoadedState,
  pickRunnableLmStudioModel,
  isLmStudioModelLoadError,
  pickLoadedLmStudioFallback,
  fetchLmStudioModelCatalog,
  getCachedLmStudioModelIds,
  getCachedLoadedLmStudioModelIds,
  getCachedLmStudioModelState,
  invalidateLmStudioModelCatalogCache,
  loadLmStudioModel,
  loadLmStudioModelForTask,
  unloadLmStudioModel,
  unloadAllLoadedLmStudioModels,
  unloadOtherLoadedLmStudioModels,
  LMSTUDIO_MODELS_CACHE_MS,
};
