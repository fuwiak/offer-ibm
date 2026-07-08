/** Синхронизировать с server/config/offerKp.models.js */
export const OFFER_KP_PADDLEOCR_VL_15_MODEL =
  "paddlepaddle/paddleocr-vl-1.5-gguf/paddleocr-vl-1.5.gguf";

/** @deprecated LM Studio short id before full GGUF pair was on disk */
const OFFER_KP_MODEL_ID_ALIASES = {
  "paddleocr-vl-1.5": OFFER_KP_PADDLEOCR_VL_15_MODEL,
};

export const OFFER_KP_MODEL_DISPLAY_OVERRIDES = {
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
  "paddlepaddle/paddleocr-vl-1.5-gguf/paddleocr-vl-1.5.gguf": {
    name: "PaddleOCR-VL 1.5",
    hint: "OCR · документы · paddleocr-vl-1.5.gguf · ~2 GB VRAM",
  },
};

export const OFFER_KP_DEFAULT_MODEL = "qwen/qwen3-vl-8b-thinking";

export const OFFER_KP_LOCAL_MODELS = Object.entries(
  OFFER_KP_MODEL_DISPLAY_OVERRIDES
).map(([id, meta]) => ({
  id,
  name: meta.name,
  provider: "lmstudio",
  group: "local",
  usage: "chat",
  hint: meta.hint,
}));

export const OFFER_KP_MODEL_GROUPS = [
  {
    id: "local",
    label: "Локальные модели",
    hint: "LM Studio · автозагрузка с /v1/models",
    models: OFFER_KP_LOCAL_MODELS,
  },
];

export const OFFER_KP_ALLOWED_MODELS = [...OFFER_KP_LOCAL_MODELS];

export function isLmStudioCatalogModelId(modelId) {
  return /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(String(modelId || "").trim());
}

export function isLmStudioAuxiliaryModelId(modelId) {
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

export function isLmStudioChatModelId(modelId) {
  const id = String(modelId || "")
    .trim()
    .toLowerCase();
  if (!id) return false;
  if (id.includes("embed")) return false;
  if (id.includes("whisper")) return false;
  if (isLmStudioAuxiliaryModelId(id)) return false;
  return true;
}

export function normalizeOfferKpModelId(modelId) {
  let id = String(modelId || "").trim();
  if (!id) return "";
  id = id.replace(/:\d+$/, "");
  return OFFER_KP_MODEL_ID_ALIASES[id] || id;
}

export function resolveOfferKpModelDisplayOverride(modelId) {
  const id = normalizeOfferKpModelId(modelId);
  return OFFER_KP_MODEL_DISPLAY_OVERRIDES[id] || null;
}

export function isOfferKpQwenModel(modelId) {
  const id = String(modelId || "")
    .trim()
    .toLowerCase();
  if (!id) return false;
  return id.split("/")[0] === "qwen";
}

export function isOfferKpPaddleOcrModel(modelId) {
  const id = String(modelId || "")
    .trim()
    .toLowerCase();
  if (!id) return false;
  return id.includes("paddleocr");
}

/** Runnable PaddleOCR LLM (not mmproj / duplicate LM Studio instance). */
export function isOfferKpRunnablePaddleOcrModel(modelId) {
  const id = normalizeOfferKpModelId(modelId).toLowerCase();
  if (!isOfferKpPaddleOcrModel(id)) return false;
  if (isLmStudioAuxiliaryModelId(id)) return false;
  const base = id.split("/").pop() || id;
  return base === "paddleocr-vl-1.5.gguf";
}

/** Модели, доступные в OfferKP picker (Qwen chat/VLM + PaddleOCR). */
export function isOfferKpPickerModel(modelId) {
  const id = String(modelId || "").trim();
  if (!id) return false;
  if (isLmStudioAuxiliaryModelId(id)) return false;
  const normalized = normalizeOfferKpModelId(id);
  if (OFFER_KP_MODEL_DISPLAY_OVERRIDES[normalized]) return true;
  if (isOfferKpQwenModel(id)) return true;
  if (isOfferKpRunnablePaddleOcrModel(id)) return true;
  return false;
}

export function findOfferKpModel(modelId, models = OFFER_KP_ALLOWED_MODELS) {
  const id = normalizeOfferKpModelId(modelId);
  return (
    models.find((m) => m.id === id) ||
    OFFER_KP_LOCAL_MODELS.find((m) => m.id === id) ||
    null
  );
}

export function mapLmStudioRemoteModel(
  entry,
  knownModels = OFFER_KP_LOCAL_MODELS
) {
  const rawId = String(entry?.id || entry || "").trim();
  if (!rawId) return null;
  if (!isLmStudioChatModelId(rawId)) return null;
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
      runnable: true,
      hint: loadHint ? `${known.hint || ""} · ${loadHint}`.trim() : known.hint,
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

export function mergeLmStudioRemoteModels(
  remoteModels = [],
  knownModels = OFFER_KP_LOCAL_MODELS
) {
  const byId = new Map();
  for (const meta of knownModels) {
    byId.set(meta.id, { ...meta });
  }
  for (const row of remoteModels) {
    const mapped = mapLmStudioRemoteModel(row, knownModels);
    if (mapped) byId.set(mapped.id, { ...byId.get(mapped.id), ...mapped });
  }
  return [...byId.values()];
}

export function isOfferKpAllowedModel(
  modelId,
  models = OFFER_KP_ALLOWED_MODELS
) {
  const id = normalizeOfferKpModelId(modelId);
  if (!id) return false;
  if (!isOfferKpPickerModel(id)) return false;
  if (models.some((m) => m.id === id)) return true;
  if (OFFER_KP_MODEL_DISPLAY_OVERRIDES[id]) return true;
  if (isOfferKpRunnablePaddleOcrModel(id)) return true;
  return isLmStudioCatalogModelId(id);
}

export function resolveOfferKpModel(modelId, models = OFFER_KP_ALLOWED_MODELS) {
  const id = normalizeOfferKpModelId(modelId);
  if (!id) return OFFER_KP_DEFAULT_MODEL;
  if (isOfferKpAllowedModel(id, models)) return id;
  if (models.length > 0) return models[0].id;
  return OFFER_KP_DEFAULT_MODEL;
}

export function isOfferKpCloudModel(_modelId) {
  return false;
}

export function isOfferKpLocalModel(modelId, models = OFFER_KP_LOCAL_MODELS) {
  const id = normalizeOfferKpModelId(modelId);
  return models.some((m) => m.id === id);
}

export function resolveOfferKpProvider(_modelId) {
  return "lmstudio";
}

export const OFFER_KP_LMSTUDIO_MODELS_URL =
  "http://87.228.90.43:1234/v1/models";
