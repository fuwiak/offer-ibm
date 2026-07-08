const llmDefaults = require("../../config/offerKp.llm.defaults");
const {
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpModel,
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
      return { loadedIds: [], stateById: {} };
    }

    const body = await res.json();
    const rows = Array.isArray(body?.data) ? body.data : [];
    const stateById = {};
    const loadedIds = [];

    for (const row of rows) {
      const id = String(row?.id || "").trim();
      if (!id || !isLmStudioChatModelId(id)) continue;
      const state = String(row?.state || "unknown").toLowerCase();
      stateById[id] = state;
      if (isLmStudioLoadedState(state)) loadedIds.push(id);
    }

    return { loadedIds, stateById };
  } catch (error) {
    offerKpLog("warn", "LM Studio runtime state fetch error", {
      error: error?.message || String(error),
    });
    return { loadedIds: [], stateById: {} };
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
    return catalogCache;
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
      offerKpLog("warn", "LM Studio /v1/models fetch failed", {
        basePath,
        error: e.message,
      });
      return null;
    });

  if (!raw) {
    return (
      catalogCache || {
        fetchedAt: now,
        ids: [],
        models: [],
        loadedIds: [],
        stateById: {},
      }
    );
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
  LMSTUDIO_MODELS_CACHE_MS,
};
