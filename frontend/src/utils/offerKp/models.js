/** Должен совпадать с server/config/offerKp.models.js */
export const OFFER_KP_ALLOWED_MODELS = [
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

export const OFFER_KP_DEFAULT_MODEL = "gpt-oss:20b";

/** @deprecated use OFFER_KP_ALLOWED_MODELS */
export const OFFER_KP_ANTHROPIC_FALLBACK_MODELS = OFFER_KP_ALLOWED_MODELS;

/** @deprecated use OFFER_KP_DEFAULT_MODEL */
export const OFFER_KP_DEFAULT_ANTHROPIC_MODEL = OFFER_KP_DEFAULT_MODEL;

export function resolveOfferKpModel(modelId) {
  const id = String(modelId || "").trim();
  if (OFFER_KP_ALLOWED_MODELS.some((m) => m.id === id)) return id;
  return OFFER_KP_DEFAULT_MODEL;
}
