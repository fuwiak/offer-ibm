/**
 * Разрешённые модели OfferKP.
 * Локальные (LM Studio) — по умолчанию; Ollama Cloud — резерв.
 */
const OFFER_KP_LOCAL_MODELS = [
  {
    id: "openai/gpt-oss-20b",
    name: "GPT-OSS 20B",
    provider: "lmstudio",
    group: "local",
    usage: "chat",
    cloudFallbackModel: "gpt-oss:120b",
    hint: "Локально · LM Studio (lainey) · OpenAI-совместимый API",
  },
  {
    id: "deepseek/deepseek-r1-0528-qwen3-8b",
    name: "DeepSeek R1 Qwen3 8B",
    provider: "lmstudio",
    group: "local",
    usage: "chat",
    cloudFallbackModel: "qwen3:14b",
    hint: "Локально · рассуждения · Q4_K_M",
  },
];

const OFFER_KP_CLOUD_MODELS = [
  {
    id: "gpt-oss:20b",
    name: "GPT-OSS 20B",
    provider: "ollama",
    group: "cloud",
    usage: "chat",
    hint: "Ollama Cloud · интерактивный чат · 60–140 т/с",
  },
  {
    id: "qwen3:14b",
    name: "Qwen 3 14B",
    provider: "ollama",
    group: "cloud",
    usage: "chat",
    hint: "Ollama Cloud · интерактивный чат · 60–140 т/с",
  },
  {
    id: "qwen3.5:27b-iq3_xxs",
    name: "Qwen 3.5 27B IQ3_XXS",
    provider: "ollama",
    group: "cloud",
    usage: "batch",
    hint: "Ollama Cloud · макс. качество · пакетная обработка · ~6 т/с",
  },
  {
    id: "qwen3-coder:30b",
    name: "Qwen 3 Coder 30B",
    provider: "ollama",
    group: "cloud",
    usage: "coding",
    hint: "Ollama Cloud · кодинг и технические задачи",
  },
];

const OFFER_KP_MODEL_GROUPS = [
  {
    id: "local",
    label: "Локальные модели",
    hint: "LM Studio · используются по умолчанию",
    models: OFFER_KP_LOCAL_MODELS,
  },
  {
    id: "cloud",
    label: "Ollama Cloud (резерв)",
    hint: "При недоступности локального сервера",
    models: OFFER_KP_CLOUD_MODELS,
  },
];

const OFFER_KP_ALLOWED_MODELS = [
  ...OFFER_KP_LOCAL_MODELS,
  ...OFFER_KP_CLOUD_MODELS,
];

const OFFER_KP_DEFAULT_MODEL = "openai/gpt-oss-20b";
const OFFER_KP_ALLOWED_MODEL_IDS = new Set(
  OFFER_KP_ALLOWED_MODELS.map((m) => m.id)
);

function findOfferKpModel(modelId) {
  return OFFER_KP_ALLOWED_MODELS.find(
    (m) => m.id === String(modelId || "").trim()
  );
}

function isOfferKpAllowedModel(modelId) {
  return OFFER_KP_ALLOWED_MODEL_IDS.has(String(modelId || "").trim());
}

function filterOfferKpModels(models = []) {
  return models.filter((m) => isOfferKpAllowedModel(m.id || m));
}

function resolveOfferKpModel(modelId) {
  const id = String(modelId || "").trim();
  if (isOfferKpAllowedModel(id)) return id;
  return OFFER_KP_DEFAULT_MODEL;
}

function resolveOfferKpProvider(modelId) {
  return findOfferKpModel(modelId)?.provider || "lmstudio";
}

function isOfferKpCloudModel(modelId) {
  return OFFER_KP_CLOUD_MODELS.some(
    (m) => m.id === String(modelId || "").trim()
  );
}

function isOfferKpLocalModel(modelId) {
  return OFFER_KP_LOCAL_MODELS.some(
    (m) => m.id === String(modelId || "").trim()
  );
}

module.exports = {
  OFFER_KP_LOCAL_MODELS,
  OFFER_KP_CLOUD_MODELS,
  OFFER_KP_MODEL_GROUPS,
  OFFER_KP_ALLOWED_MODELS,
  OFFER_KP_DEFAULT_MODEL,
  OFFER_KP_ALLOWED_MODEL_IDS,
  findOfferKpModel,
  isOfferKpAllowedModel,
  isOfferKpCloudModel,
  isOfferKpLocalModel,
  filterOfferKpModels,
  resolveOfferKpModel,
  resolveOfferKpProvider,
};
