const llmDefaults = require("../../config/offerKp.llm.defaults");
const { offerKpLog } = require("./offerKpLog");

const LMSTUDIO_MODELS_CACHE_MS = Number(
  process.env.LMSTUDIO_MODELS_CACHE_MS || 60_000
);

/** @type {{ fetchedAt: number, ids: string[], models: object[] } | null} */
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

/**
 * GET {base}/models — OpenAI-compatible LM Studio catalog.
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
    return catalogCache || { fetchedAt: now, ids: [], models: [] };
  }

  const chatModels = raw.filter((m) => isLmStudioChatModelId(m?.id));
  const ids = chatModels.map((m) => m.id);

  catalogCache = {
    fetchedAt: now,
    ids,
    models: chatModels,
  };

  offerKpLog("info", "LM Studio model catalog refreshed", {
    basePath,
    count: ids.length,
    ids,
  });

  return catalogCache;
}

function getCachedLmStudioModelIds() {
  return catalogCache?.ids ? [...catalogCache.ids] : [];
}

function invalidateLmStudioModelCatalogCache() {
  catalogCache = null;
}

module.exports = {
  lmStudioBaseUrl,
  isLmStudioChatModelId,
  fetchLmStudioModelCatalog,
  getCachedLmStudioModelIds,
  invalidateLmStudioModelCatalogCache,
  LMSTUDIO_MODELS_CACHE_MS,
};
