const llmDefaults = require("../../config/offerKp.llm.defaults");
const {
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpModel,
  resolveOfferKpProvider,
  findOfferKpModel,
} = require("../../config/offerKp.models");
const {
  ollamaCloudFallbackEnabled,
  ollamaCloudModel,
  createOllamaCloudClient,
} = require("../AiProviders/ollama/cloudFallback");
const { offerKpLog, offerKpLogTimed } = require("./offerKpLog");

function ensureOllamaBasePath() {
  if (
    process.env.OLLAMA_BASE_PATH &&
    String(process.env.OLLAMA_BASE_PATH).trim()
  ) {
    return process.env.OLLAMA_BASE_PATH;
  }
  process.env.OLLAMA_BASE_PATH =
    llmDefaults.OLLAMA_BASE_PATH || "http://212.41.6.162:11434";
  return process.env.OLLAMA_BASE_PATH;
}

function ensureLmStudioBasePath() {
  if (
    process.env.LMSTUDIO_BASE_PATH &&
    String(process.env.LMSTUDIO_BASE_PATH).trim()
  ) {
    return process.env.LMSTUDIO_BASE_PATH;
  }
  process.env.LMSTUDIO_BASE_PATH =
    llmDefaults.LMSTUDIO_BASE_PATH || "http://87.228.90.43:1234/v1";
  return process.env.LMSTUDIO_BASE_PATH;
}

async function isLmStudioReachable() {
  const basePath = ensureLmStudioBasePath();
  const timer = offerKpLogTimed("LM Studio health check", { basePath });
  try {
    const url = new URL(basePath);
    url.pathname = "/models";
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(4000),
    });
    const ok = res.ok;
    timer.done({ ok, status: res.status });
    return ok;
  } catch (err) {
    timer.fail(err);
    return false;
  }
}

/**
 * Resolve system/workspace LLM provider and model for offer-kp.
 * Local LM Studio models by default; Ollama Cloud when explicitly selected or as fallback.
 * @param {{ provider?: string|null, model?: string|null }} params
 * @returns {{ provider: string, model: string }}
 */
function resolveLlmProviderAndModel({ provider = null, model = null } = {}) {
  ensureOllamaBasePath();
  ensureLmStudioBasePath();

  const resolvedModel = resolveOfferKpModel(
    model ||
      process.env.LMSTUDIO_MODEL_PREF ||
      process.env.OLLAMA_MODEL_PREF ||
      llmDefaults.LMSTUDIO_MODEL_PREF ||
      llmDefaults.OLLAMA_MODEL_PREF ||
      OFFER_KP_DEFAULT_MODEL
  );

  const modelProvider = resolveOfferKpProvider(resolvedModel);
  const resolvedProvider =
    provider && ["lmstudio", "ollama"].includes(String(provider).trim())
      ? String(provider).trim()
      : modelProvider;

  if (resolvedProvider === "lmstudio") {
    process.env.LMSTUDIO_MODEL_PREF = resolvedModel;
  } else {
    process.env.OLLAMA_MODEL_PREF = resolvedModel;
  }

  const resolved = {
    provider: resolvedProvider,
    model: resolvedModel,
  };
  offerKpLog("info", "Resolved LLM provider", resolved);
  return resolved;
}

/**
 * If LM Studio is down, switch to Ollama Cloud model before chat/agent run.
 * @param {{ provider?: string|null, model?: string|null, log?: Function }} params
 */
async function resolveLlmProviderWithFallback({
  provider = null,
  model = null,
  log = null,
} = {}) {
  const emit = (msg, meta) => {
    log?.(meta ? `${msg} ${JSON.stringify(meta)}` : msg);
    offerKpLog("info", msg, meta);
  };

  const resolved = resolveLlmProviderAndModel({ provider, model });

  if (resolved.provider !== "lmstudio") {
    emit("Using configured provider", resolved);
    return resolved;
  }

  const reachable = await isLmStudioReachable();
  if (reachable) {
    emit("LM Studio reachable", resolved);
    return resolved;
  }

  if (!ollamaCloudFallbackEnabled()) {
    offerKpLog(
      "warn",
      "LM Studio unreachable and cloud fallback disabled",
      resolved
    );
    return resolved;
  }

  const cloudClient = createOllamaCloudClient();
  if (!cloudClient) {
    offerKpLog("warn", "LM Studio unreachable; Ollama Cloud client unavailable");
    return resolved;
  }

  const meta = findOfferKpModel(resolved.model);
  const cloudModel =
    meta?.cloudFallbackModel || ollamaCloudModel(resolved.model);

  emit("LM Studio unavailable; falling back to Ollama Cloud", {
    lmStudioBasePath: process.env.LMSTUDIO_BASE_PATH,
    from: resolved.model,
    to: cloudModel,
  });

  ensureOllamaBasePath();
  return {
    provider: "ollama",
    model: cloudModel,
    fallbackFrom: "lmstudio",
  };
}

module.exports = {
  resolveLlmProviderAndModel,
  resolveLlmProviderWithFallback,
  ensureOllamaBasePath,
  ensureLmStudioBasePath,
  isLmStudioReachable,
};
