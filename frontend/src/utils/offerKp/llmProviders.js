import { AVAILABLE_LLM_PROVIDERS } from "@/pages/GeneralSettings/LLMPreference";

export const OFFER_KP_LMSTUDIO_PROVIDER = "lmstudio";

/** offer-kp: LM Studio only. */
export const OFFER_KP_LLM_PROVIDERS = AVAILABLE_LLM_PROVIDERS.filter(
  (p) => p.value === OFFER_KP_LMSTUDIO_PROVIDER
);
