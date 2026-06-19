/**
 * OfferKp default LLM config — LM Studio locally (lainey).
 */
const { OFFER_KP_DEFAULT_MODEL } = require("./offerKp.models");

/** LM Studio on dedicated server lainey (Selectel) */
const OFFER_KP_LMSTUDIO_HOST = "http://87.228.90.43:1234/v1";

module.exports = {
  LLM_PROVIDER: "lmstudio",
  LMSTUDIO_BASE_PATH: OFFER_KP_LMSTUDIO_HOST,
  LMSTUDIO_MODEL_PREF: OFFER_KP_DEFAULT_MODEL,
  OFFER_KP_DEFAULT_LLM_LABEL: "LM Studio (GPT-OSS 20B)",
  OFFER_KP_LMSTUDIO_HOST,
};
