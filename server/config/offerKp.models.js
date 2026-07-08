/**
 * OfferKP models — LM Studio catalog is fetched live from GET /v1/models.
 * Static entries below are display overrides only (names, hints).
 * Синхронизировать с frontend/src/utils/offerKp/models.js (только Qwen).
 */
const OFFER_KP_MODEL_DISPLAY_OVERRIDES = {
  "qwen/qwen3-vl-8b-thinking": {
    name: "Qwen3-VL-8B Thinking",
    hint: "Локально · vision · рассуждения · Q4_K_M · ~8 GB VRAM",
  },
  "qwen/qwen3-vl-8b": {
    name: "Qwen3-VL-8B",
    hint: "Локально · vision · Q4_K_M",
  },
  "qwen/qwen3-14b": {
    name: "Qwen3-14B",
    hint: "Локально · текст · Q4_K_M · ~9 GB VRAM",
  },
  "qwen/qwen2.5-vl-7b": {
    name: "Qwen2.5-VL-7B",
    hint: "Локально · vision · Q4_K_M",
  },
};

const OFFER_KP_DEFAULT_MODEL = "qwen/qwen3-vl-8b-thinking";

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

function isLmStudioCatalogModelId(modelId) {
  return /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(String(modelId || "").trim());
}

function isOfferKpQwenModel(modelId) {
  const id = String(modelId || "").trim().toLowerCase();
  if (!id) return false;
  return id.split("/")[0] === "qwen";
}

function findOfferKpModel(modelId, models = OFFER_KP_ALLOWED_MODELS) {
  const id = String(modelId || "").trim();
  return (
    models.find((m) => m.id === id) ||
    OFFER_KP_LOCAL_MODELS.find((m) => m.id === id) ||
    null
  );
}

function mapLmStudioRemoteModel(entry, knownModels = OFFER_KP_LOCAL_MODELS) {
  const id = String(entry?.id || entry || "").trim();
  if (!id) return null;
  if (!isOfferKpQwenModel(id)) return null;

  const loadState = String(entry?.loadState || "").toLowerCase();
  const override = OFFER_KP_MODEL_DISPLAY_OVERRIDES[id];
  const known = findOfferKpModel(id, knownModels);
  const loadHint =
    loadState === "loaded"
      ? "VRAM · loaded"
      : loadState
        ? `VRAM · ${loadState}`
        : null;

  if (known) {
    return {
      ...known,
      loadState: loadState || known.loadState || null,
      loaded: loadState === "loaded",
      hint: loadHint ? `${known.hint || ""} · ${loadHint}`.trim() : known.hint,
      runnable: true,
    };
  }

  const shortName = id.split("/").pop() || id;
  return {
    id,
    name: override?.name || shortName.replace(/-/g, " "),
    provider: "lmstudio",
    group: "local",
    usage: "chat",
    loadState: loadState || null,
    loaded: loadState === "loaded",
    runnable: true,
    hint:
      [override?.hint, loadHint].filter(Boolean).join(" · ") ||
      "LM Studio · автозагрузка при первом запросе",
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
  if (!isOfferKpQwenModel(id)) return false;
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
  isOfferKpQwenModel,
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
