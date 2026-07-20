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
  registerHarnessBlock("memory", () => {
    const { MemoryBlock } = require("./blocks/memoryBlock");
    return new MemoryBlock();
  });
  registerHarnessBlock("context-manager", () => {
    const { ContextManagerBlock } = require("./blocks/contextManagerBlock");
    return new ContextManagerBlock();
  });
  registerHarnessBlock("harness-telemetry", () => {
    const { HarnessTelemetryBlock } = require("./blocks/harnessTelemetryBlock");
    return new HarnessTelemetryBlock();
  });
  registerHarnessBlock("orchestration", () => {
    const { OrchestrationBlock } = require("./blocks/orchestrationBlock");
    return new OrchestrationBlock();
  });
  registerHarnessBlock("offerKp-document-trigger", () => {
    const {
      OfferKpDocumentTriggerBlock,
    } = require("./blocks/offerKpDocumentTriggerBlock");
    return new OfferKpDocumentTriggerBlock();
  });
  registerHarnessBlock("offerKp-catalog-guidelines", () => {
    const {
      OfferKpCatalogGuidelinesBlock,
    } = require("./blocks/offerKpCatalogGuidelinesBlock");
    return new OfferKpCatalogGuidelinesBlock();
  });
  registerHarnessBlock("offerKp-quote-intent", () => {
    const {
      OfferKpQuoteIntentBlock,
    } = require("./blocks/offerKpQuoteIntentBlock");
    return new OfferKpQuoteIntentBlock();
  });
  registerHarnessBlock("tool-registry", () => {
    const { ToolRegistryBlock } = require("./blocks/toolRegistryBlock");
    return new ToolRegistryBlock();
  });
  registerHarnessBlock("offerKp-thread-follow-up", () => {
    const {
      OfferKpThreadFollowUpBlock,
    } = require("./blocks/offerKpThreadFollowUpBlock");
    return new OfferKpThreadFollowUpBlock();
  });
  registerHarnessBlock("offerKp-quote-pdf-model", () => {
    const {
      OfferKpQuotePdfModelBlock,
    } = require("./blocks/offerKpQuotePdfModelBlock");
    return new OfferKpQuotePdfModelBlock();
  });
  registerHarnessBlock("offerKp-catalog-context", () => {
    const {
      OfferKpCatalogContextBlock,
    } = require("./blocks/offerKpCatalogContextBlock");
    return new OfferKpCatalogContextBlock();
  });
  registerHarnessBlock("offerKp-inquiry-quality", () => {
    const mod = require("./blocks/offerKpInquiryQualityBlock");
    const Block = mod?.OfferKpInquiryQualityBlock;
    if (typeof Block !== "function") {
      throw new Error(
        "OfferKpInquiryQualityBlock export missing (circular require?)"
      );
    }
    return new Block();
  });
  registerHarnessBlock("offerKp-quote-calculator", () => {
    const mod = require("./blocks/offerKpQuoteCalculatorBlock");
    const Block = mod?.OfferKpQuoteCalculatorBlock;
    if (typeof Block !== "function") {
      throw new Error("OfferKpQuoteCalculatorBlock export missing");
    }
    return new Block();
  });
  registerHarnessBlock("offerKp-quote-compliance", () => {
    const mod = require("./blocks/offerKpQuoteComplianceBlock");
    const Block = mod?.OfferKpQuoteComplianceBlock;
    if (typeof Block !== "function") {
      throw new Error("OfferKpQuoteComplianceBlock export missing");
    }
    return new Block();
  });
}

registerDefaultBlocks();

module.exports = {
  registerHarnessBlock,
  createRegisteredBlock,
  listRegisteredBlocks,
  DEFAULT_OFFER_KP_BLOCK_IDS,
  resolveOfferKpBlockIds,
};
