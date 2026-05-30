/**
 * OpenRouter API key from Railway aliases.
 * Supports both OPENROUTER_API_KEY and OPEN_ROUTER_TOKEN.
 */
function resolveOpenRouterApiKey() {
  const key =
    process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_TOKEN || null;
  return key && String(key).trim() ? String(key).trim() : null;
}

/** Mirror OPEN_ROUTER_TOKEN into OPENROUTER_API_KEY for existing SDK usage. */
function applyOpenRouterEnvAliases() {
  const key = resolveOpenRouterApiKey();
  if (key) process.env.OPENROUTER_API_KEY = key;
}

module.exports = {
  resolveOpenRouterApiKey,
  applyOpenRouterEnvAliases,
};
