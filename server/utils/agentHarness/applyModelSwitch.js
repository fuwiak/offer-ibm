const { resolveModelHarnessPreset } = require("./presets/modelPresetRegistry");

/**
 * Apply resolved model to harness preset state and live aibitat provider config.
 * @param {import("./AgentHarness")} harness
 * @param {string} modelId
 * @param {object} [meta]
 */
function applyHarnessModelSwitch(harness, modelId, meta = {}) {
  const id = String(modelId || "").trim();
  if (!id || !harness) return false;

  const preset = resolveModelHarnessPreset(id);
  preset.prepare(harness);
  harness.ctx.modelId = id;
  harness.state.set("modelId", id);
  if (meta && Object.keys(meta).length) {
    harness.state.set("quotePdfModelSwitch", { ...meta, model: id });
  }

  const aibitat = harness.aibitat;
  if (aibitat) {
    aibitat.model = id;
    aibitat.defaultProvider = {
      ...aibitat.defaultProvider,
      model: id,
    };
    if (aibitat.provider?.model !== undefined) {
      aibitat.provider.model = id;
    }
  }

  return true;
}

module.exports = { applyHarnessModelSwitch };
