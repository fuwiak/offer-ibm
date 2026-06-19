import { AVAILABLE_LLM_PROVIDERS } from "@/pages/GeneralSettings/LLMPreference";

export const OFFER_KP_LMSTUDIO_PROVIDER = "lmstudio";
export const OFFER_KP_OLLAMA_PROVIDER = "ollama";

/** offer-kp: LM Studio (локально) + Ollama Cloud (резерв). */
export const OFFER_KP_LLM_PROVIDERS = AVAILABLE_LLM_PROVIDERS.filter(
  (p) =>
    p.value === OFFER_KP_LMSTUDIO_PROVIDER ||
    p.value === OFFER_KP_OLLAMA_PROVIDER
);

/** @deprecated use OFFER_KP_OLLAMA_PROVIDER */
export const OFFER_KP_OPENROUTER_PROVIDER = OFFER_KP_OLLAMA_PROVIDER;
