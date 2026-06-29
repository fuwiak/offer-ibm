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

/** Порядок блоков в дефолтном OfferKP preset. Добавляйте id сюда или через env. */
const DEFAULT_OFFER_KP_BLOCK_IDS = [
  "memory",
  "context-manager",
  "harness-telemetry",
  "orchestration",
  "offerKp-document-trigger",
  "offerKp-catalog-guidelines",
  "offerKp-quote-pdf-model",
  "offerKp-quote-intent",
  "offerKp-thread-follow-up",
  "tool-registry",
];

function parseExtraBlockIdsFromEnv() {
  const raw = (process.env.OFFER_KP_HARNESS_EXTRA_BLOCKS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveOfferKpBlockIds() {
  const extra = parseExtraBlockIdsFromEnv();
  const seen = new Set(DEFAULT_OFFER_KP_BLOCK_IDS);
  const ids = [...DEFAULT_OFFER_KP_BLOCK_IDS];
  for (const id of extra) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
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
}

registerDefaultBlocks();

module.exports = {
  registerHarnessBlock,
  createRegisteredBlock,
  listRegisteredBlocks,
  DEFAULT_OFFER_KP_BLOCK_IDS,
  resolveOfferKpBlockIds,
};
