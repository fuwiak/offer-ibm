import { AVAILABLE_LLM_PROVIDERS } from "@/pages/GeneralSettings/LLMPreference";

export const LAWYER_REVIZORRO_OPENROUTER_PROVIDER = "openrouter";

/** lawyer-revizorro: OpenRouter only — provider entry for settings and workspace pickers. */
export const LAWYER_REVIZORRO_LLM_PROVIDERS = AVAILABLE_LLM_PROVIDERS.filter(
  (p) => p.value === LAWYER_REVIZORRO_OPENROUTER_PROVIDER
);
