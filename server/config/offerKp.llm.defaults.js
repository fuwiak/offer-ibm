/**
 * OfferKp default LLM config — LM Studio on lainey (Selectel).
 * Sync with Railway: LMSTUDIO_BASE_PATH, LMSTUDIO_MODEL_PREF, LMSTUDIO_MODEL_TOKEN_LIMIT.
 */
const OFFER_KP_LM_DEFAULT_MODEL = "qwen/qwen3-vl-8b-thinking";
const OFFER_KP_LM_OCR_MODEL =
  "paddlepaddle/paddleocr-vl-1.5-gguf/paddleocr-vl-1.5.gguf";

/** LM Studio on dedicated server lainey */
const OFFER_KP_LMSTUDIO_HOST = "http://87.228.90.43:1234/v1";

/** Loaded context in LM Studio VRAM — agent prompts can exceed 4k tokens. */
const OFFER_KP_LM_CONTEXT_TOKENS = 32768;

module.exports = {
  LLM_PROVIDER: "lmstudio",
  LMSTUDIO_BASE_PATH: OFFER_KP_LMSTUDIO_HOST,
  LMSTUDIO_MODEL_PREF: OFFER_KP_LM_DEFAULT_MODEL,
  LMSTUDIO_OCR_MODEL_PREF: OFFER_KP_LM_OCR_MODEL,
  LMSTUDIO_MODEL_TOKEN_LIMIT: String(OFFER_KP_LM_CONTEXT_TOKENS),
  // Native OpenAI-style tools for OpenRouter teacher / agents (create-docx, quote-calculator…).
  PROVIDER_SUPPORTS_NATIVE_TOOL_CALLING:
    "generic-openai,bedrock,localai,groq,litellm,openrouter",
  OFFER_KP_DEFAULT_LLM_LABEL: "LM Studio (Qwen3-VL-8B Thinking)",
  OFFER_KP_OCR_LLM_LABEL: "LM Studio (PaddleOCR-VL 1.5 · чтение файлов)",
  OFFER_KP_LMSTUDIO_HOST,
};
