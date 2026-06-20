/** Синхронизировать с server/config/offerKp.models.js */
export const OFFER_KP_MODEL_DISPLAY_OVERRIDES = {
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

export const OFFER_KP_DEFAULT_MODEL = "openai/gpt-oss-20b";

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
