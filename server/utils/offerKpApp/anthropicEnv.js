/**
 * Anthropic / Claude API key from Railway (`CLAUDE_API_KEY`) or legacy `ANTHROPIC_API_KEY`.
 * @see https://platform.claude.com/docs/en/api/overview
 */
function resolveAnthropicApiKey() {
  const key =
    process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || null;
  return key && String(key).trim() ? String(key).trim() : null;
}

/** Mirror CLAUDE_API_KEY into ANTHROPIC_API_KEY for existing SDK usage. */
function applyAnthropicEnvAliases() {
  const key = resolveAnthropicApiKey();
  if (key) process.env.ANTHROPIC_API_KEY = key;
}

/**
 * Whether a model id should use the direct Anthropic API (not OpenRouter).
 * @param {string} model
 */
function isAnthropicModelId(model = "") {
  const m = String(model).toLowerCase().trim();
  if (!m) return false;
  if (m.includes("claude")) return true;
  if (m.startsWith("anthropic/") || m.includes("/claude")) return true;
  if (/^(claude-|anthropic\.)/.test(m)) return true;
  // OpenRouter-style short names when provider prefix was stripped
  if (/^(opus|sonnet|haiku)(-|\d|_|$)/.test(m)) return true;
  return false;
}

/** Strip OpenRouter-style provider prefix for Anthropic Messages API. */
function normalizeAnthropicModelId(model = "") {
  const raw = String(model).trim();
  if (!raw) {
    const llmDefaults = require("../../config/offerKp.llm.defaults");
    return (
      process.env.ANTHROPIC_MODEL_PREF || llmDefaults.ANTHROPIC_MODEL_PREF
    );
  }
  if (raw.includes("/")) return raw.split("/").pop();
  return raw;
}

module.exports = {
  resolveAnthropicApiKey,
  applyAnthropicEnvAliases,
  isAnthropicModelId,
  normalizeAnthropicModelId,
};
