/**
 * OfferKP models — LM Studio catalog is fetched live from GET /v1/models.
 * Static entries below are display overrides only (names, hints).
 * Синхронизировать с frontend/src/utils/offerKp/models.js
 */
const OFFER_KP_PADDLEOCR_VL_15_MODEL =
  "paddlepaddle/paddleocr-vl-1.5-gguf/paddleocr-vl-1.5.gguf";

/** @deprecated LM Studio short id before full GGUF pair was on disk */
const OFFER_KP_MODEL_ID_ALIASES = {
  "paddleocr-vl-1.5": OFFER_KP_PADDLEOCR_VL_15_MODEL,
};

const OFFER_KP_MODEL_DISPLAY_OVERRIDES = {
  "openai/gpt-oss-20b": {
    name: "gpt-oss-20b",
    hint: "Локально · agent brain · tools · T4: ctx 32768",
  },
  "qwen/qwen3-vl-8b-thinking": {
    name: "Qwen3-VL-8B Thinking",
    hint: "Локально · eyes / OCR · vision · ~8 GB VRAM",
  },
  "qwen/qwen3-vl-30b": {
    name: "Qwen3-VL-30B A3B",
    hint: "Локально · vision · Q4_K_M · T4: ctx 8192, gpu 0.9",
  },
  "qwen/qwen3-vl-8b": {
    name: "Qwen3-VL-8B",
    hint: "Локально · vision · fallback brain · Q4_K_M",
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

/** OCR-only (не для чата/@agent). */
const OFFER_KP_OCR_MODEL_METADATA = {
  [OFFER_KP_PADDLEOCR_VL_15_MODEL]: {
    name: "PaddleOCR-VL 1.5",
    hint: "Чтение PDF · автоматически при загрузке · не для чата",
    usage: "ocr",
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

function isLmStudioCatalogModelId(modelId) {
  return /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(String(modelId || "").trim());
}

function isLmStudioAuxiliaryModelId(modelId) {
  const id = String(modelId || "")
    .trim()
    .toLowerCase();
  if (!id) return true;
  if (/:\d+$/.test(id)) return true;
  if (id.includes("mmproj")) return true;
  if (id.includes("-projector")) return true;
  if (id.includes("/clip/") || id.endsWith(".clip")) return true;
  return false;
}

function normalizeOfferKpModelId(modelId) {
  let id = String(modelId || "").trim();
  if (!id) return "";
  id = id.replace(/:\d+$/, "");
  return OFFER_KP_MODEL_ID_ALIASES[id] || id;
}

function resolveOfferKpModelDisplayOverride(modelId) {
  const id = normalizeOfferKpModelId(modelId);
  return OFFER_KP_MODEL_DISPLAY_OVERRIDES[id] || null;
}

function isOfferKpQwenModel(modelId) {
  const id = String(modelId || "")
    .trim()
    .toLowerCase();
  if (!id) return false;
  return id.split("/")[0] === "qwen";
}

function isOfferKpPaddleOcrModel(modelId) {
  const id = String(modelId || "")
    .trim()
    .toLowerCase();
  if (!id) return false;
  return id.includes("paddleocr");
}

function isOfferKpRunnablePaddleOcrModel(modelId) {
  const id = normalizeOfferKpModelId(modelId).toLowerCase();
  if (!isOfferKpPaddleOcrModel(id)) return false;
  if (isLmStudioAuxiliaryModelId(id)) return false;
  const base = id.split("/").pop() || id;
  return base === "paddleocr-vl-1.5.gguf";
}

function isOfferKpOcrOnlyModel(modelId) {
  return isOfferKpRunnablePaddleOcrModel(modelId);
}

function isOfferKpChatModel(modelId) {
  const id = String(modelId || "").trim();
  if (!id || isOfferKpOcrOnlyModel(id)) return false;
  const normalized = normalizeOfferKpModelId(id);
  if (OFFER_KP_MODEL_DISPLAY_OVERRIDES[normalized]) return true;
  return isOfferKpQwenModel(id);
}

function isOfferKpPickerModel(modelId) {
  const id = String(modelId || "").trim();
  if (!id) return false;
  if (isLmStudioAuxiliaryModelId(id)) return false;
  return isOfferKpChatModel(id);
}

function findOfferKpModel(modelId, models = OFFER_KP_ALLOWED_MODELS) {
  const id = normalizeOfferKpModelId(modelId);
  return (
    models.find((m) => m.id === id) ||
    OFFER_KP_LOCAL_MODELS.find((m) => m.id === id) ||
    null
  );
}

function mapLmStudioRemoteModel(entry, knownModels = OFFER_KP_LOCAL_MODELS) {
  const rawId = String(entry?.id || entry || "").trim();
  if (!rawId) return null;
  if (!isOfferKpPickerModel(rawId)) return null;

  const id = normalizeOfferKpModelId(rawId);
  const loadState = String(entry?.loadState || "").toLowerCase();
  const override = resolveOfferKpModelDisplayOverride(id);
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
  for (const meta of OFFER_KP_LOCAL_MODELS) {
    byId.set(meta.id, { ...meta });
  }
  for (const row of remoteModels) {
    const mapped = mapLmStudioRemoteModel(row);
    if (mapped) {
      byId.set(mapped.id, { ...byId.get(mapped.id), ...mapped });
    }
  }
  return [...byId.values()];
}

function isOfferKpAllowedModel(modelId, liveIds = null) {
  const id = normalizeOfferKpModelId(modelId);
  if (!id) return false;
  if (!isOfferKpPickerModel(id)) return false;
  if (Array.isArray(liveIds) && liveIds.includes(id)) return true;
  if (OFFER_KP_MODEL_DISPLAY_OVERRIDES[id]) return true;
  return isLmStudioCatalogModelId(id) && isOfferKpQwenModel(id);
}

function filterOfferKpModels(models = []) {
  return models.map((m) => mapLmStudioRemoteModel(m)).filter(Boolean);
}

function resolveOfferKpModel(modelId, liveIds = null) {
  const id = normalizeOfferKpModelId(modelId);
  if (!id) return OFFER_KP_DEFAULT_MODEL;
  if (isOfferKpOcrOnlyModel(id)) return OFFER_KP_DEFAULT_MODEL;
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
  const id = normalizeOfferKpModelId(modelId);
  return models.some((m) => m.id === id);
}

function normalizeWorkspaceModelId(modelId) {
  return normalizeOfferKpModelId(modelId);
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
  let picked = chat && agent && chat !== agent ? chat : chat || agent;
  if (!picked || isOfferKpOcrOnlyModel(picked)) {
    picked = OFFER_KP_DEFAULT_MODEL;
  }
  return picked || OFFER_KP_DEFAULT_MODEL;
}

function resolveOfferKpOcrModel() {
  const llmDefaults = require("./offerKp.llm.defaults");
  const {
    resolvePipelineVisionModel,
  } = require("../utils/offerKp/offerKpModelPipeline");
  return normalizeOfferKpModelId(
    process.env.OFFER_KP_PIPELINE_VISION_MODEL ||
      process.env.LMSTUDIO_OCR_MODEL_PREF ||
      llmDefaults.OFFER_KP_PIPELINE_VISION_MODEL ||
      llmDefaults.LMSTUDIO_OCR_MODEL_PREF ||
      resolvePipelineVisionModel()
  );
}

function resolveOfferKpChatModel(workspace) {
  return resolveOfferKpEffectiveModel(workspace);
}

module.exports = {
  OFFER_KP_PADDLEOCR_VL_15_MODEL,
  OFFER_KP_MODEL_DISPLAY_OVERRIDES,
  OFFER_KP_LOCAL_MODELS,
  OFFER_KP_MODEL_GROUPS,
  OFFER_KP_ALLOWED_MODELS,
  OFFER_KP_DEFAULT_MODEL,
  findOfferKpModel,
  normalizeOfferKpModelId,
  resolveOfferKpModelDisplayOverride,
  isOfferKpQwenModel,
  isOfferKpPaddleOcrModel,
  isOfferKpRunnablePaddleOcrModel,
  isOfferKpOcrOnlyModel,
  isOfferKpChatModel,
  isLmStudioAuxiliaryModelId,
  isOfferKpPickerModel,
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
  resolveOfferKpOcrModel,
  resolveOfferKpChatModel,
  normalizeWorkspaceModelId,
};
