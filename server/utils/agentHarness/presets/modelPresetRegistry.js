const {
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpEffectiveModel,
} = require("../../../config/offerKp.models");
const {
  DefaultOfferKpHarnessPreset,
} = require("./models/DefaultOfferKpHarnessPreset");
const { GptOss20bHarnessPreset } = require("./models/GptOss20bHarnessPreset");
const { DeepseekR1HarnessPreset } = require("./models/DeepseekR1HarnessPreset");
const { Gemma12bHarnessPreset } = require("./models/Gemma12bHarnessPreset");
const {
  Gemma12bQatHarnessPreset,
} = require("./models/Gemma12bQatHarnessPreset");

/** @type {Map<string, typeof import("./BaseModelHarnessPreset").BaseModelHarnessPreset>} */
const presetByModelId = new Map();

/** @type {Array<{ pattern: RegExp, PresetClass: typeof import("./BaseModelHarnessPreset").BaseModelHarnessPreset }>} */
const presetByPattern = [];

function registerModelHarnessPreset(modelId, PresetClass) {
  const id = String(modelId || "").trim();
  if (!id || typeof PresetClass !== "function") {
    throw new TypeError(
      "registerModelHarnessPreset(modelId, PresetClass) invalid args"
    );
  }
  presetByModelId.set(id, PresetClass);
}

function registerModelHarnessPresetPattern(pattern, PresetClass) {
  if (!(pattern instanceof RegExp) || typeof PresetClass !== "function") {
    throw new TypeError(
      "registerModelHarnessPresetPattern(pattern, PresetClass) invalid args"
    );
  }
  presetByPattern.push({ pattern, PresetClass });
}

function normalizeModelId(modelId) {
  return String(modelId || "").trim();
}

function resolveModelIdFromContext({
  model = null,
  workspace = null,
  invocation = null,
} = {}) {
  const ws = workspace || invocation?.workspace || null;
  return (
    normalizeModelId(model) ||
    (ws ? resolveOfferKpEffectiveModel(ws) : "") ||
    normalizeModelId(process.env.LMSTUDIO_MODEL_PREF) ||
    OFFER_KP_DEFAULT_MODEL
  );
}

/**
 * @param {string} modelId
 * @returns {import("./BaseModelHarnessPreset").BaseModelHarnessPreset}
 */
function resolveModelHarnessPreset(modelId) {
  const id = normalizeModelId(modelId) || OFFER_KP_DEFAULT_MODEL;

  const exact = presetByModelId.get(id);
  if (exact) return new exact(id);

  for (const { pattern, PresetClass } of presetByPattern) {
    if (pattern.test(id)) return new PresetClass(id);
  }

  return new DefaultOfferKpHarnessPreset(id);
}

function listRegisteredModelHarnessPresets() {
  return [...presetByModelId.keys()];
}

function registerDefaultModelHarnessPresets() {
  registerModelHarnessPreset("openai/gpt-oss-20b", GptOss20bHarnessPreset);
  registerModelHarnessPreset(
    "deepseek/deepseek-r1-0528-qwen3-8b",
    DeepseekR1HarnessPreset
  );
  registerModelHarnessPreset("google/gemma-4-12b", Gemma12bHarnessPreset);
  registerModelHarnessPreset(
    "google/gemma-4-12b-qat",
    Gemma12bQatHarnessPreset
  );

  registerModelHarnessPresetPattern(/^deepseek\//i, DeepseekR1HarnessPreset);
  registerModelHarnessPresetPattern(
    /^google\/gemma-4-12b-qat/i,
    Gemma12bQatHarnessPreset
  );
  registerModelHarnessPresetPattern(/^google\/gemma/i, Gemma12bHarnessPreset);
  registerModelHarnessPresetPattern(
    /^openai\/gpt-oss/i,
    GptOss20bHarnessPreset
  );
}

registerDefaultModelHarnessPresets();

module.exports = {
  registerModelHarnessPreset,
  registerModelHarnessPresetPattern,
  resolveModelHarnessPreset,
  resolveModelIdFromContext,
  listRegisteredModelHarnessPresets,
};
