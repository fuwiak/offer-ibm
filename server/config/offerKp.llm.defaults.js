/**
 * OfferKp default LLM config — LM Studio on lainey (Selectel).
 * Sync with Railway: LMSTUDIO_BASE_PATH, LMSTUDIO_MODEL_PREF, LMSTUDIO_MODEL_TOKEN_LIMIT.
 */
const OFFER_KP_LM_DEFAULT_MODEL = "qwen/qwen3-vl-8b-thinking";

/** LM Studio on dedicated server lainey */
const OFFER_KP_LMSTUDIO_HOST = "http://87.228.90.43:1234/v1";

/** Loaded context in LM Studio VRAM — agent prompts can exceed 4k tokens. */
const OFFER_KP_LM_CONTEXT_TOKENS = 32768;

module.exports = {
  LLM_PROVIDER: "lmstudio",
  LMSTUDIO_BASE_PATH: OFFER_KP_LMSTUDIO_HOST,
  LMSTUDIO_MODEL_PREF: OFFER_KP_LM_DEFAULT_MODEL,
  LMSTUDIO_MODEL_TOKEN_LIMIT: String(OFFER_KP_LM_CONTEXT_TOKENS),
  OFFER_KP_DEFAULT_LLM_LABEL: "LM Studio (Qwen3-VL-8B Thinking)",
  OFFER_KP_LMSTUDIO_HOST,
};
