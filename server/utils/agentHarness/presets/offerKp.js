const { AgentHarness } = require("../AgentHarness");
const {
  createRegisteredBlock,
  resolveOfferKpBlockIds,
} = require("../registry");

/**
 * Default OfferKP harness preset.
 * Новые блоки: registerHarnessBlock() в registry.js + id в DEFAULT_OFFER_KP_BLOCK_IDS
 * или OFFER_KP_HARNESS_EXTRA_BLOCKS=your-block-id
 *
 * @param {{ aibitat: object, invocation?: object, log?: Function, blockIds?: string[] }} options
 */
async function buildOfferKpHarness({
  aibitat,
  invocation = null,
  log = null,
  blockIds = null,
} = {}) {
  const harness = new AgentHarness({
    aibitat,
    ctx: {
      invocation,
      workspace: invocation?.workspace ?? null,
      log,
    },
  });

  const ids = blockIds || resolveOfferKpBlockIds();
  for (const id of ids) {
    harness.use(createRegisteredBlock(id));
  }

  await harness.install();
  return harness;
}

module.exports = { buildOfferKpHarness };
