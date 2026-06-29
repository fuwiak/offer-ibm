/**
 * OfferKP models — LM Studio catalog is fetched live from GET /v1/models.
 * Static entries below are display overrides only (names, hints).
 */
const OFFER_KP_MODEL_DISPLAY_OVERRIDES = {
  "openai/gpt-oss-20b": {
    name: "GPT-OSS 20B",
    hint: "Локально · LM Studio (lainey) · OpenAI-совместимый API",
  },
  "deepseek/deepseek-r1-0528-qwen3-8b": {
    name: "DeepSeek R1 Qwen3 8B",
    hint: "Локально · рассуждения · Q4_K_M",
  },
  "google/gemma-4-12b": {
    name: "Gemma 4 12B Instruct",
    hint: "Локально · LM Studio · Q4_K_M",
  },
  "google/gemma-4-12b-qat": {
    name: "Gemma 4 12B QAT",
    hint: "Локально · LM Studio · QAT",
  },
};

const OFFER_KP_DEFAULT_MODEL = "openai/gpt-oss-20b";

/** Fallback when LM Studio API is unreachable (dev/offline). */
const OFFER_KP_LOCAL_MODELS = Object.entries(
  OFFER_KP_MODEL_DISPLAY_OVERRIDES
).map(([id, meta]) => ({
  id,
  name: meta.name,
  provider: "lmstudio",
  group: "local",
  usage: "chat",
  hint: meta.hint,
}));

const OFFER_KP_MODEL_GROUPS = [
  {
    id: "local",
    label: "Локальные модели",
    hint: "LM Studio · автозагрузка с /v1/models",
    models: OFFER_KP_LOCAL_MODELS,
  },
];

const OFFER_KP_ALLOWED_MODELS = [...OFFER_KP_LOCAL_MODELS];

function findOfferKpModel(modelId, models = OFFER_KP_ALLOWED_MODELS) {
  const id = String(modelId || "").trim();
  return (
    models.find((m) => m.id === id) ||
    OFFER_KP_LOCAL_MODELS.find((m) => m.id === id) ||
    null
  );
}

function isLmStudioCatalogModelId(modelId) {
  return /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(String(modelId || "").trim());
}

function mapLmStudioRemoteModel(entry, knownModels = OFFER_KP_LOCAL_MODELS) {
  const id = String(entry?.id || entry || "").trim();
  if (!id) return null;

  const override = OFFER_KP_MODEL_DISPLAY_OVERRIDES[id];
  const known = findOfferKpModel(id, knownModels);
  if (known) return { ...known };

  const shortName = id.split("/").pop() || id;
  return {
    id,
    name: override?.name || shortName.replace(/-/g, " "),
    provider: "lmstudio",
    group: "local",
    usage: "chat",
    hint: override?.hint || "LM Studio · załadowany model",
  };
}

function mergeLmStudioRemoteModels(remoteModels = []) {
  const byId = new Map();
  for (const row of remoteModels) {
    const mapped = mapLmStudioRemoteModel(row);
    if (mapped) byId.set(mapped.id, mapped);
  }
  if (byId.size === 0) {
    for (const meta of OFFER_KP_LOCAL_MODELS) {
      byId.set(meta.id, { ...meta });
    }
  }
  return [...byId.values()];
}

function isOfferKpAllowedModel(modelId, liveIds = null) {
  const id = String(modelId || "").trim();
  if (!id) return false;
  if (Array.isArray(liveIds) && liveIds.includes(id)) return true;
  if (OFFER_KP_MODEL_DISPLAY_OVERRIDES[id]) return true;
  return isLmStudioCatalogModelId(id);
}

function filterOfferKpModels(models = []) {
  return models.map((m) => mapLmStudioRemoteModel(m)).filter(Boolean);
}

function resolveOfferKpModel(modelId, liveIds = null) {
  const id = String(modelId || "").trim();
  if (!id) return OFFER_KP_DEFAULT_MODEL;
  if (isOfferKpAllowedModel(id, liveIds)) return id;
  if (Array.isArray(liveIds) && liveIds.length > 0) return liveIds[0];
  return OFFER_KP_DEFAULT_MODEL;
}

function resolveOfferKpProvider(_modelId) {
  return "lmstudio";
}

function isOfferKpCloudModel(_modelId) {
  return false;
}

function isOfferKpLocalModel(modelId, models = OFFER_KP_LOCAL_MODELS) {
  return models.some((m) => m.id === String(modelId || "").trim());
}

function normalizeWorkspaceModelId(modelId) {
  return String(modelId || "").trim();
}

/**
 * Модель для chat и @agent: chatModel из UI-пикера — источник истины,
 * если расходится с устаревшим agentModel.
 * @param {object|null|undefined} workspace
 * @returns {string}
 */
function resolveOfferKpEffectiveModel(workspace) {
  const chat = normalizeWorkspaceModelId(workspace?.chatModel);
  const agent = normalizeWorkspaceModelId(workspace?.agentModel);
  if (chat && agent && chat !== agent) return chat;
  return chat || agent || OFFER_KP_DEFAULT_MODEL;
}

module.exports = {
  OFFER_KP_MODEL_DISPLAY_OVERRIDES,
  OFFER_KP_LOCAL_MODELS,
  OFFER_KP_MODEL_GROUPS,
  OFFER_KP_ALLOWED_MODELS,
  OFFER_KP_DEFAULT_MODEL,
  findOfferKpModel,
  isOfferKpAllowedModel,
  isLmStudioCatalogModelId,
  mapLmStudioRemoteModel,
  mergeLmStudioRemoteModels,
  isOfferKpCloudModel,
  isOfferKpLocalModel,
  filterOfferKpModels,
  resolveOfferKpModel,
  resolveOfferKpProvider,
  resolveOfferKpEffectiveModel,
  normalizeWorkspaceModelId,
};
