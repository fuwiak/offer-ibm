const { AgentHarness } = require("../AgentHarness");
const { createRegisteredBlock } = require("../registry");
const {
  resolveModelHarnessPreset,
  resolveModelIdFromContext,
} = require("./modelPresetRegistry");

/**
 * OfferKP harness с индивидуальным preset под LLM-модель workspace.
 *
 * Новая модель:
 * 1) server/config/offerKp.models.js — display override
 * 2) presets/models/MyModelHarnessPreset.js extends BaseModelHarnessPreset
 * 3) modelPresetRegistry.js — registerModelHarnessPreset("vendor/model", MyModelHarnessPreset)
 *
 * @param {{ aibitat: object, invocation?: object, log?: Function, model?: string|null, blockIds?: string[]|null, modelPreset?: import("./BaseModelHarnessPreset").BaseModelHarnessPreset|null }} options
 */
async function buildOfferKpHarness({
  aibitat,
  invocation = null,
  log = null,
  model = null,
  blockIds = null,
  modelPreset = null,
} = {}) {
  const workspace = invocation?.workspace ?? null;
  const modelId = resolveModelIdFromContext({ model, workspace, invocation });
  const preset = modelPreset || resolveModelHarnessPreset(modelId);

  const harness = new AgentHarness({
    aibitat,
    ctx: {
      invocation,
      workspace,
      log,
      modelId: preset.modelId,
      modelPreset: preset,
    },
  });

  preset.prepare(harness);

  const ids = blockIds || preset.blockIds();
  for (const id of ids) {
    harness.use(createRegisteredBlock(id));
  }

  await harness.install();
  return harness;
}

module.exports = { buildOfferKpHarness };
