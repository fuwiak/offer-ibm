/** Должен совпадать с server/config/offerKp.models.js */
export const OFFER_KP_LOCAL_MODELS = [
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

export const OFFER_KP_CLOUD_MODELS = [
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

export const OFFER_KP_MODEL_GROUPS = [
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

export const OFFER_KP_ALLOWED_MODELS = [
  ...OFFER_KP_LOCAL_MODELS,
  ...OFFER_KP_CLOUD_MODELS,
];

export const OFFER_KP_DEFAULT_MODEL = "openai/gpt-oss-20b";

/** @deprecated use OFFER_KP_ALLOWED_MODELS */
export const OFFER_KP_ANTHROPIC_FALLBACK_MODELS = OFFER_KP_ALLOWED_MODELS;

/** @deprecated use OFFER_KP_DEFAULT_MODEL */
export const OFFER_KP_DEFAULT_ANTHROPIC_MODEL = OFFER_KP_DEFAULT_MODEL;

export function findOfferKpModel(modelId) {
  return OFFER_KP_ALLOWED_MODELS.find(
    (m) => m.id === String(modelId || "").trim()
  );
}

export function resolveOfferKpModel(modelId) {
  const id = String(modelId || "").trim();
  if (OFFER_KP_ALLOWED_MODELS.some((m) => m.id === id)) return id;
  return OFFER_KP_DEFAULT_MODEL;
}

export function resolveOfferKpProvider(modelId) {
  return findOfferKpModel(modelId)?.provider || "lmstudio";
}
