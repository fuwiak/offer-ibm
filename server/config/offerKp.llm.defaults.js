/**
 * OfferKp default LLM config (Ollama — локальные модели 16 ГБ).
 */
const { OFFER_KP_DEFAULT_MODEL } = require("./offerKp.models");

module.exports = {
  LLM_PROVIDER: "ollama",
  OLLAMA_MODEL_PREF: OFFER_KP_DEFAULT_MODEL,
  OFFER_KP_DEFAULT_LLM_LABEL: "Ollama (GPT-OSS 20B)",
};
