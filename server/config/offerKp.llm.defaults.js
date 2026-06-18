/**
 * OfferKp default LLM config — Ollama на выделенном сервере Bohr (Selectel SPB-2).
 */
const { OFFER_KP_DEFAULT_MODEL } = require("./offerKp.models");

/** Публичный IP dedicated-сервера Bohr; Ollama слушает :11434 */
const OFFER_KP_OLLAMA_HOST = "http://212.41.6.162:11434";

module.exports = {
  LLM_PROVIDER: "ollama",
  OLLAMA_BASE_PATH: OFFER_KP_OLLAMA_HOST,
  OLLAMA_MODEL_PREF: OFFER_KP_DEFAULT_MODEL,
  OFFER_KP_DEFAULT_LLM_LABEL: "Ollama (GPT-OSS 20B)",
  OFFER_KP_OLLAMA_HOST,
};
