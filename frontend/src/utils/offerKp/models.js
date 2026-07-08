/** Синхронизировать с server/config/offerKp.models.js (только Qwen во фронте) */
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

export function isLmStudioChatModelId(modelId) {
  const id = String(modelId || "")
    .trim()
    .toLowerCase();
  if (!id) return false;
  if (id.includes("embed")) return false;
  if (id.includes("whisper")) return false;
  return true;
}

export function isOfferKpQwenModel(modelId) {
  const id = String(modelId || "").trim().toLowerCase();
  if (!id) return false;
  return id.split("/")[0] === "qwen";
}

export function findOfferKpModel(modelId, models = OFFER_KP_ALLOWED_MODELS) {
  const id = String(modelId || "").trim();
  return (
    models.find((m) => m.id === id) ||
    OFFER_KP_LOCAL_MODELS.find((m) => m.id === id) ||
    null
  );
}

export function mapLmStudioRemoteModel(entry, knownModels = OFFER_KP_LOCAL_MODELS) {
  const id = String(entry?.id || entry || "").trim();
  if (!id) return null;
  if (!isLmStudioChatModelId(id)) return null;
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
  for (const row of remoteModels) {
    const mapped = mapLmStudioRemoteModel(row, knownModels);
    if (mapped) byId.set(mapped.id, mapped);
  }
  if (byId.size === 0) {
    for (const meta of OFFER_KP_LOCAL_MODELS) {
      byId.set(meta.id, { ...meta });
    }
  }
  return [...byId.values()];
}

export function isOfferKpAllowedModel(modelId, models = OFFER_KP_ALLOWED_MODELS) {
  const id = String(modelId || "").trim();
  if (!id) return false;
  if (!isOfferKpQwenModel(id)) return false;
  if (models.some((m) => m.id === id)) return true;
  if (OFFER_KP_MODEL_DISPLAY_OVERRIDES[id]) return true;
  return isLmStudioCatalogModelId(id);
}

export function resolveOfferKpModel(modelId, models = OFFER_KP_ALLOWED_MODELS) {
  const id = String(modelId || "").trim();
  if (!id) return OFFER_KP_DEFAULT_MODEL;
  if (isOfferKpAllowedModel(id, models)) return id;
  if (models.length > 0) return models[0].id;
  return OFFER_KP_DEFAULT_MODEL;
}

export function isOfferKpCloudModel(_modelId) {
  return false;
}

export function isOfferKpLocalModel(modelId, models = OFFER_KP_LOCAL_MODELS) {
  return models.some((m) => m.id === String(modelId || "").trim());
}

export function resolveOfferKpProvider(_modelId) {
  return "lmstudio";
}

export const OFFER_KP_LMSTUDIO_MODELS_URL =
  "http://87.228.90.43:1234/v1/models";
