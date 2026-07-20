/**
 * OfferKp default LLM config — LM Studio on lainey (Selectel).
 * Sync with Railway: LMSTUDIO_BASE_PATH, LMSTUDIO_MODEL_PREF, LMSTUDIO_MODEL_TOKEN_LIMIT.
 */
// T4 16 GB: keep one multimodal model resident. Swapping Qwen Thinking ↔
// gpt-oss costs 90+ seconds and can unload a model from an active request.
const OFFER_KP_LM_DEFAULT_MODEL = "qwen/qwen3-vl-8b";
const OFFER_KP_LM_OCR_MODEL = "qwen/qwen3-vl-8b";
const OFFER_KP_LM_VISION_MODEL = "qwen/qwen3-vl-8b";
const OFFER_KP_LM_AGENT_FALLBACK = "qwen/qwen3-vl-8b";

/** LM Studio on dedicated server lainey */
const OFFER_KP_LMSTUDIO_HOST = "http://87.228.90.43:1234/v1";

/** Default chat/agent context (T4: prefer ≥26k for agent brain). */
const OFFER_KP_LM_CONTEXT_TOKENS = 32768;
const OFFER_KP_PIPELINE_AGENT_CONTEXT = 32768;

module.exports = {
  LLM_PROVIDER: "lmstudio",
  LMSTUDIO_BASE_PATH: OFFER_KP_LMSTUDIO_HOST,
  LMSTUDIO_MODEL_PREF: OFFER_KP_LM_DEFAULT_MODEL,
  LMSTUDIO_OCR_MODEL_PREF: OFFER_KP_LM_OCR_MODEL,
  LMSTUDIO_MODEL_TOKEN_LIMIT: String(OFFER_KP_LM_CONTEXT_TOKENS),
  OFFER_KP_PIPELINE_VISION_MODEL: OFFER_KP_LM_VISION_MODEL,
  OFFER_KP_PIPELINE_AGENT_MODEL: OFFER_KP_LM_DEFAULT_MODEL,
  OFFER_KP_PIPELINE_AGENT_FALLBACK: OFFER_KP_LM_AGENT_FALLBACK,
  OFFER_KP_PIPELINE_AGENT_CONTEXT: String(OFFER_KP_PIPELINE_AGENT_CONTEXT),
  OFFER_KP_SINGLE_MODEL: "true",
  // Native OpenAI-style tools for OpenRouter teacher / agents (create-docx, quote-calculator…).
  PROVIDER_SUPPORTS_NATIVE_TOOL_CALLING:
    "generic-openai,bedrock,localai,groq,litellm,openrouter,lmstudio",
  OFFER_KP_DEFAULT_LLM_LABEL: "LM Studio (Qwen3-VL-8B · resident T4 model)",
  OFFER_KP_OCR_LLM_LABEL: "LM Studio (Qwen3-VL-8B · fast vision OCR)",
  OFFER_KP_LMSTUDIO_HOST,
};
