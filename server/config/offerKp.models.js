/**
 * Разрешённые локальные модели OfferKP (16 ГБ VRAM/RAM).
 * Единственный источник правды для picker и API /offerKp/config.
 */
const OFFER_KP_ALLOWED_MODELS = [
  {
    id: "gpt-oss:20b",
    name: "GPT-OSS 20B",
    usage: "chat",
    hint: "Интерактивный чат и агенты · 60–140 т/с",
  },
  {
    id: "qwen3:14b",
    name: "Qwen 3 14B",
    usage: "chat",
    hint: "Интерактивный чат и агенты · 60–140 т/с",
  },
  {
    id: "qwen3.5:27b-iq3_xxs",
    name: "Qwen 3.5 27B IQ3_XXS",
    usage: "batch",
    hint: "Макс. качество · пакетная обработка · ~6 т/с",
  },
  {
    id: "qwen3-coder:30b",
    name: "Qwen 3 Coder 30B",
    usage: "coding",
    hint: "Кодинг и технические задачи",
  },
];

const OFFER_KP_DEFAULT_MODEL = "gpt-oss:20b";
const OFFER_KP_ALLOWED_MODEL_IDS = new Set(
  OFFER_KP_ALLOWED_MODELS.map((m) => m.id)
);

function isOfferKpAllowedModel(modelId) {
  return OFFER_KP_ALLOWED_MODEL_IDS.has(String(modelId || "").trim());
}

function filterOfferKpModels(models = []) {
  return models.filter((m) => isOfferKpAllowedModel(m.id || m));
}

module.exports = {
  OFFER_KP_ALLOWED_MODELS,
  OFFER_KP_DEFAULT_MODEL,
  OFFER_KP_ALLOWED_MODEL_IDS,
  isOfferKpAllowedModel,
  filterOfferKpModels,
};
