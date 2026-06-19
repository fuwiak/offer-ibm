/**
 * OfferKp default LLM config — LM Studio локально (lainey), Ollama Cloud как резерв.
 */
const { OFFER_KP_DEFAULT_MODEL } = require("./offerKp.models");

/** LM Studio на dedicated-сервере lainey (Selectel) */
const OFFER_KP_LMSTUDIO_HOST = "http://87.228.90.43:1234/v1";

/** Ollama на Bohr (Selectel SPB-2) — для явного выбора cloud-моделей */
const OFFER_KP_OLLAMA_HOST = "http://212.41.6.162:11434";

module.exports = {
  LLM_PROVIDER: "lmstudio",
  LMSTUDIO_BASE_PATH: OFFER_KP_LMSTUDIO_HOST,
  LMSTUDIO_MODEL_PREF: OFFER_KP_DEFAULT_MODEL,
  OLLAMA_BASE_PATH: OFFER_KP_OLLAMA_HOST,
  OLLAMA_MODEL_PREF: "gpt-oss:20b",
  OLLAMA_CLOUD_FALLBACK: "0",
  OFFER_KP_DEFAULT_LLM_LABEL: "LM Studio (GPT-OSS 20B)",
  OFFER_KP_LMSTUDIO_HOST,
  OFFER_KP_OLLAMA_HOST,
};
