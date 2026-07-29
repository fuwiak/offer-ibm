"use strict";

/**
 * Shared OfferKP decoding profile: LLM may read / classify / propose
 * candidates, but sampling itself must stay pinned for repeatability.
 *
 * Temperature alone is not enough — also pin top_p + seed. Full bit-identical
 * tokens still need fixed GGUF checksum / LM Studio / GPU; this profile
 * maximises structural draft repeatability on our side.
 */

const OFFER_KP_DETERMINISTIC_SEED = 20260730;

const OFFER_KP_DETERMINISTIC_SAMPLING = Object.freeze({
  temperature: 0,
  top_p: 1,
  seed: OFFER_KP_DETERMINISTIC_SEED,
});

/**
 * Strict mode: LLM ranking/judges off; uncertainty → abstention / clarify.
 * Default ON for maximum determinism; set OFFER_KP_STRICT_DETERMINISM=0 to relax.
 */
function offerKpStrictDeterminismEnabled() {
  const flag = String(
    process.env.OFFER_KP_STRICT_DETERMINISM ?? "true"
  )
    .trim()
    .toLowerCase();
  return !["0", "false", "no", "off"].includes(flag);
}

/**
 * Chat / agent completion options for OfferKP paths.
 * Ignores workspace.openAiTemp — KP ops must not use creative sampling.
 */
function resolveOfferKpChatSampling(extra = {}) {
  return {
    ...OFFER_KP_DETERMINISTIC_SAMPLING,
    ...extra,
    temperature: 0,
    top_p:
      extra.top_p === undefined
        ? OFFER_KP_DETERMINISTIC_SAMPLING.top_p
        : extra.top_p,
    seed:
      extra.seed === undefined
        ? OFFER_KP_DETERMINISTIC_SAMPLING.seed
        : extra.seed,
  };
}

/**
 * Build OpenAI-compatible create() body fields from a sampling bag.
 * Omits undefined so providers that reject unknown keys stay happy.
 */
function samplingToCompletionParams(sampling = {}) {
  const out = {};
  if (sampling.temperature !== undefined)
    out.temperature = sampling.temperature;
  if (sampling.top_p !== undefined) out.top_p = sampling.top_p;
  if (sampling.seed !== undefined) out.seed = sampling.seed;
  if (sampling.max_tokens !== undefined) out.max_tokens = sampling.max_tokens;
  if (sampling.stop !== undefined) out.stop = sampling.stop;
  if (sampling.response_format !== undefined)
    out.response_format = sampling.response_format;
  return out;
}

/**
 * Stable product/candidate comparator: score desc → price asc → sku → id.
 */
function compareByDeterministicTieBreak(a, b, {
  scoreOf = (x) =>
    Number(x?._nameSimilarity ?? x?._score ?? x?.score ?? 0) || 0,
  priceOf = (x) => Number(x?.price) || 0,
} = {}) {
  const scoreDiff = scoreOf(b) - scoreOf(a);
  if (scoreDiff) return scoreDiff;
  const priceA = priceOf(a);
  const priceB = priceOf(b);
  if (priceA && priceB && priceA !== priceB) return priceA - priceB;
  const skuCmp = String(a?.sku || a?.article || "").localeCompare(
    String(b?.sku || b?.article || "")
  );
  if (skuCmp) return skuCmp;
  const idA = Number(a?.id ?? a?.productId) || 0;
  const idB = Number(b?.id ?? b?.productId) || 0;
  if (idA !== idB) return idA - idB;
  return String(a?.name || "").localeCompare(String(b?.name || ""));
}

module.exports = {
  OFFER_KP_DETERMINISTIC_SEED,
  OFFER_KP_DETERMINISTIC_SAMPLING,
  offerKpStrictDeterminismEnabled,
  resolveOfferKpChatSampling,
  samplingToCompletionParams,
  compareByDeterministicTieBreak,
};
