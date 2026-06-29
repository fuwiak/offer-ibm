const { AgentHarness } = require("./AgentHarness");
const { BaseBlock } = require("./BaseBlock");
const blocks = require("./blocks");
const registry = require("./registry");
const { buildOfferKpHarness } = require("./presets/offerKp");
const { BaseModelHarnessPreset } = require("./presets/BaseModelHarnessPreset");
const modelPresetRegistry = require("./presets/modelPresetRegistry");
const harnessGuidelines = require("../../config/offerKp.harnessGuidelines");
const harnessAntiHallucination = require("../../config/offerKp.harnessAntiHallucination");

module.exports = {
  AgentHarness,
  BaseBlock,
  BaseModelHarnessPreset,
  blocks,
  registry,
  modelPresetRegistry,
  harnessGuidelines,
  harnessAntiHallucination,
  buildOfferKpHarness,
};
