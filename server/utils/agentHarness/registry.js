const { MemoryBlock } = require("./blocks/memoryBlock");
const { ContextManagerBlock } = require("./blocks/contextManagerBlock");
const { OrchestrationBlock } = require("./blocks/orchestrationBlock");
const { HarnessTelemetryBlock } = require("./blocks/harnessTelemetryBlock");
const {
  OfferKpDocumentTriggerBlock,
} = require("./blocks/offerKpDocumentTriggerBlock");
const { OfferKpQuoteIntentBlock } = require("./blocks/offerKpQuoteIntentBlock");
const {
  OfferKpCatalogGuidelinesBlock,
} = require("./blocks/offerKpCatalogGuidelinesBlock");
const { ToolRegistryBlock } = require("./blocks/toolRegistryBlock");
const {
  OfferKpThreadFollowUpBlock,
} = require("./blocks/offerKpThreadFollowUpBlock");
const {
  OfferKpQuotePdfModelBlock,
} = require("./blocks/offerKpQuotePdfModelBlock");
const {
  OfferKpCatalogContextBlock,
} = require("./blocks/offerKpCatalogContextBlock");
const {
  OfferKpQuoteCalculatorBlock,
} = require("./blocks/offerKpQuoteCalculatorBlock");
const {
  OfferKpQuoteComplianceBlock,
} = require("./blocks/offerKpQuoteComplianceBlock");

const {
  DEFAULT_OFFER_KP_BLOCK_IDS,
  resolveOfferKpBlockIds,
} = require("./blockIds");

/** @type {Map<string, () => import("./BaseBlock").BaseBlock>} */
const blockRegistry = new Map();

function registerHarnessBlock(id, factory) {
  if (!id || typeof factory !== "function") {
    throw new TypeError(
      "registerHarnessBlock(id, factory) requires a string id and factory"
    );
  }
  blockRegistry.set(id, factory);
}

function createRegisteredBlock(id) {
  const factory = blockRegistry.get(id);
  if (!factory) {
    throw new Error(`Unknown harness block: ${id}`);
  }
  return factory();
}

function listRegisteredBlocks() {
  return [...blockRegistry.keys()];
}

function registerDefaultBlocks() {
  registerHarnessBlock("memory", () => new MemoryBlock());
  registerHarnessBlock("context-manager", () => new ContextManagerBlock());
  registerHarnessBlock("harness-telemetry", () => new HarnessTelemetryBlock());
  registerHarnessBlock("orchestration", () => new OrchestrationBlock());
  registerHarnessBlock(
    "offerKp-document-trigger",
    () => new OfferKpDocumentTriggerBlock()
  );
  registerHarnessBlock(
    "offerKp-catalog-guidelines",
    () => new OfferKpCatalogGuidelinesBlock()
  );
  registerHarnessBlock(
    "offerKp-quote-intent",
    () => new OfferKpQuoteIntentBlock()
  );
  registerHarnessBlock("tool-registry", () => new ToolRegistryBlock());
  registerHarnessBlock(
    "offerKp-thread-follow-up",
    () => new OfferKpThreadFollowUpBlock()
  );
  registerHarnessBlock(
    "offerKp-quote-pdf-model",
    () => new OfferKpQuotePdfModelBlock()
  );
  registerHarnessBlock(
    "offerKp-catalog-context",
    () => new OfferKpCatalogContextBlock()
  );
  registerHarnessBlock(
    "offerKp-quote-calculator",
    () => new OfferKpQuoteCalculatorBlock()
  );
  registerHarnessBlock(
    "offerKp-quote-compliance",
    () => new OfferKpQuoteComplianceBlock()
  );
}

registerDefaultBlocks();

module.exports = {
  registerHarnessBlock,
  createRegisteredBlock,
  listRegisteredBlocks,
  DEFAULT_OFFER_KP_BLOCK_IDS,
  resolveOfferKpBlockIds,
};
