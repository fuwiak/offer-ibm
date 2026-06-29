const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const {
  applyOpenRouterEnvAliases,
} = require("../utils/offerKpApp/openRouterEnv");
const {
  applyAnthropicEnvAliases,
} = require("../utils/offerKpApp/anthropicEnv");

/** Ключи OfferKP / shop / LLM — подставляются из Railway, если нет в .env */
const RAILWAY_FALLBACK_KEYS = [
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DATABASE_URL",
  "SHOP_DB_ENRICH",
  "SHOP_DB_SEARCH_AGENT",
  "SHOP_DB_SEARCH_AGENT_LLM",
  "SHOP_DB_MAX_PRODUCTS",
  "SHOP_DB_ENRICH_TIMEOUT_MS",
  "SHOP_DB_CONNECT_TIMEOUT_MS",
  "SHOP_DB_SSL",
  "DB_SSL",
  "SHOP_BASE_URL",
  "ELI_DISABLED",
  "LLM_PROVIDER",
  "LMSTUDIO_BASE_PATH",
  "LMSTUDIO_MODEL_PREF",
  "LMSTUDIO_MODEL_TOKEN_LIMIT",
  "OLLAMA_BASE_PATH",
  "OLLAMA_MODEL_PREF",
  "OLLAMA_AUTH_TOKEN",
  "OLLAMA_CLOUD_BASE_PATH",
  "OLLAMA_CLOUD_MODEL_PREF",
  "OLLAMA_CLOUD_FALLBACK",
  "OPENROUTER_API_KEY",
  "OPEN_ROUTER_TOKEN",
  "OPENROUTER_MODEL_PREF",
  "CLAUDE_API_KEY",
  "ANTHROPIC_API_KEY",
  "JWT_SECRET",
  "SIG_KEY",
  "SIG_SALT",
  "STORAGE_DIR",
];

/** primary → запасные имена (как в Railway dashboard) */
const ENV_ALIASES = [
  ["OPENROUTER_API_KEY", ["OPEN_ROUTER_TOKEN"]],
  ["ANTHROPIC_API_KEY", ["CLAUDE_API_KEY"]],
  ["CLAUDE_API_KEY", ["ANTHROPIC_API_KEY"]],
];

function envIsSet(key, source = process.env) {
  const v = source[key];
  return v != null && String(v).trim() !== "";
}

function captureProcessEnvFallback(keys = RAILWAY_FALLBACK_KEYS) {
  const snapshot = {};
  for (const key of keys) {
    if (envIsSet(key)) snapshot[key] = String(process.env[key]).trim();
  }
  return snapshot;
}

/**
 * Локальная копия Railway Variables (gitignored: server/.env.railway, ../.env.railway).
 * В snapshot попадают только ключи, которых ещё нет (приоритет у process.env / Railway).
 */
function mergeEnvFileIntoFallback(envPath, snapshot) {
  if (!fs.existsSync(envPath)) return;
  const parsed = dotenv.parse(fs.readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (envIsSet(key, snapshot)) continue;
    if (value != null && String(value).trim() !== "") {
      snapshot[key] = String(value).trim();
    }
  }
}

function loadRailwayFallbackFiles(serverDir, repoRoot) {
  const snapshot = captureProcessEnvFallback();
  mergeEnvFileIntoFallback(path.join(serverDir, ".env.railway"), snapshot);
  mergeEnvFileIntoFallback(path.join(repoRoot, ".env.railway"), snapshot);
  return snapshot;
}

function applyRailwayEnvFallback(snapshot) {
  for (const key of RAILWAY_FALLBACK_KEYS) {
    if (envIsSet(key)) continue;
    const value = snapshot[key];
    if (value == null || value === "") continue;
    process.env[key] = value;
  }

  for (const [primary, aliases] of ENV_ALIASES) {
    if (envIsSet(primary)) continue;
    for (const alias of aliases) {
      if (envIsSet(alias)) {
        process.env[primary] = process.env[alias].trim();
        break;
      }
    }
  }

  applyOpenRouterEnvAliases();
  applyAnthropicEnvAliases();
}

module.exports = {
  RAILWAY_FALLBACK_KEYS,
  envIsSet,
  captureProcessEnvFallback,
  mergeEnvFileIntoFallback,
  loadRailwayFallbackFiles,
  applyRailwayEnvFallback,
};
