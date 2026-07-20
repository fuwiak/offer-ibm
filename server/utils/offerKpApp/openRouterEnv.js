/**
 * OpenRouter API key from Railway aliases.
 * Supports both OPENROUTER_API_KEY and OPEN_ROUTER_TOKEN.
 */
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function resolveOpenRouterApiKey() {
  const key =
    process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_TOKEN || null;
  return key && String(key).trim() ? String(key).trim() : null;
}

/**
 * OpenRouter OpenAI-compatible base URL.
 * Use OPENROUTER_BASE_URL to route via an egress proxy when the app host
 * is geo-blocked (Selectel RU → 403 "Access denied by security policy").
 */
function resolveOpenRouterBaseUrl() {
  const raw = String(process.env.OPENROUTER_BASE_URL || "").trim();
  if (!raw) return DEFAULT_OPENROUTER_BASE_URL;
  return raw.replace(/\/+$/, "");
}

/** Default browser-like headers OpenRouter expects. */
function resolveOpenRouterHeaders() {
  return {
    "HTTP-Referer":
      process.env.OPENROUTER_HTTP_REFERER || "https://offer-ibm.ru",
    "X-Title": process.env.OPENROUTER_APP_TITLE || "offer-kp",
  };
}

/** Mirror OPEN_ROUTER_TOKEN into OPENROUTER_API_KEY for existing SDK usage. */
function applyOpenRouterEnvAliases() {
  const key = resolveOpenRouterApiKey();
  if (key) process.env.OPENROUTER_API_KEY = key;
}

module.exports = {
  DEFAULT_OPENROUTER_BASE_URL,
  resolveOpenRouterApiKey,
  resolveOpenRouterBaseUrl,
  resolveOpenRouterHeaders,
  applyOpenRouterEnvAliases,
};
