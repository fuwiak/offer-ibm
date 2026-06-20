const { AgentHarness } = require("../AgentHarness");
const {
  MemoryBlock,
  ContextManagerBlock,
  OrchestrationBlock,
  HarnessTelemetryBlock,
  OfferKpDocumentTriggerBlock,
  OfferKpQuoteIntentBlock,
  ToolRegistryBlock,
} = require("../blocks");

/**
 * Default OfferKP harness preset.
 * Add new blocks with harness.use(new MyBlock()) before install().
 *
 * @param {{ aibitat: object, invocation?: object, log?: Function }} options
 */
async function buildOfferKpHarness({ aibitat, invocation = null, log = null }) {
  const harness = new AgentHarness({
    aibitat,
    ctx: {
      invocation,
      workspace: invocation?.workspace ?? null,
      log,
    },
  });

  harness
    .use(new MemoryBlock())
    .use(new ContextManagerBlock())
    .use(new HarnessTelemetryBlock())
    .use(new OrchestrationBlock())
    .use(new OfferKpDocumentTriggerBlock())
    .use(new OfferKpQuoteIntentBlock())
    .use(new ToolRegistryBlock());

  await harness.install();
  return harness;
}

module.exports = { buildOfferKpHarness };
