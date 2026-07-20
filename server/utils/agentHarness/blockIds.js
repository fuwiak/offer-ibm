/** Порядок блоков в дефолтном OfferKP preset. Добавляйте id сюда или через env. */
const DEFAULT_OFFER_KP_BLOCK_IDS = [
  "memory",
  "context-manager",
  "harness-telemetry",
  "orchestration",
  "offerKp-document-trigger",
  "offerKp-source-verification",
  "offerKp-catalog-context",
  "offerKp-inquiry-quality",
  "offerKp-quote-pdf-model",
  "offerKp-catalog-guidelines",
  "offerKp-quote-compliance",
  "offerKp-quote-intent",
  "offerKp-quote-calculator",
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

module.exports = {
  DEFAULT_OFFER_KP_BLOCK_IDS,
  resolveOfferKpBlockIds,
};
