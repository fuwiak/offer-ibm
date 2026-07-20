/**
 * Curated context windows for OpenRouter models used by OfferKP (teacher LLM
 * and manual overrides). OpenRouterLLM.promptWindowLimit() normally reads
 * storage/models/openrouter/models.json, but that cache is populated lazily
 * on first `isValidChatCompletionModel()` call — a path OfferKP's agent flow
 * never hits. Without this table the provider silently fell back to 4096
 * tokens for every OpenRouter model (including 200K+ models like Gemini
 * 2.5 Flash), truncating catalog/context way below what the model can
 * actually take and triggering premature "exceeds context limit" summarization.
 *
 * Keep in sync with https://openrouter.ai/models when adding new teacher
 * models to OPENROUTER_MODEL_PREF.
 */
const KNOWN_OPENROUTER_CONTEXT_WINDOWS = {
  "google/gemini-2.5-flash": 1_048_576,
  "google/gemini-2.5-pro": 1_048_576,
  "google/gemini-2.0-flash-001": 1_048_576,
  "qwen/qwen3-vl-235b-a22b-instruct": 131_072,
  "qwen/qwen3-vl-235b-a22b-thinking": 131_072,
  "qwen/qwen3-235b-a22b": 131_072,
  "openai/gpt-4o": 128_000,
  "openai/gpt-4o-mini": 128_000,
  "openai/gpt-4.1": 1_047_576,
  "openai/gpt-4.1-mini": 1_047_576,
  "openai/gpt-oss-20b": 131_072,
  "anthropic/claude-3.5-sonnet": 200_000,
  "anthropic/claude-3.7-sonnet": 200_000,
  "deepseek/deepseek-r1": 128_000,
  "deepseek/deepseek-chat": 64_000,
  "meta-llama/llama-3.3-70b-instruct": 131_072,
};

/**
 * Last-resort window when a model is unknown and the OpenRouter models.json
 * cache has not been populated yet. Matches OFFER_KP_LM_CONTEXT_TOKENS
 * (config/offerKp.llm.defaults.js) instead of an arbitrary 4096 — every
 * OpenRouter model OfferKP actually uses supports at least this much.
 */
const FALLBACK_CONTEXT_WINDOW = 32_768;

/**
 * @param {string} modelName
 * @returns {number|null} known context window, or null if not curated
 */
function lookupKnownContextWindow(modelName) {
  const id = String(modelName || "").trim();
  if (!id) return null;
  return KNOWN_OPENROUTER_CONTEXT_WINDOWS[id] || null;
}

module.exports = {
  KNOWN_OPENROUTER_CONTEXT_WINDOWS,
  FALLBACK_CONTEXT_WINDOW,
  lookupKnownContextWindow,
};
