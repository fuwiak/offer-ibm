import { AVAILABLE_LLM_PROVIDERS } from "@/pages/GeneralSettings/LLMPreference";

export const OFFER_KP_OPENROUTER_PROVIDER = "openrouter";

/** offer-kp: OpenRouter only — provider entry for settings and workspace pickers. */
export const OFFER_KP_LLM_PROVIDERS = AVAILABLE_LLM_PROVIDERS.filter(
  (p) => p.value === OFFER_KP_OPENROUTER_PROVIDER
);
