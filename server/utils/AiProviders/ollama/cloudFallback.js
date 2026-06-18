const { Ollama } = require("ollama");

function ollamaCloudFallbackEnabled() {
  const flag = String(process.env.OLLAMA_CLOUD_FALLBACK ?? "1").trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") return false;
  return !!(process.env.OLLAMA_AUTH_TOKEN && String(process.env.OLLAMA_AUTH_TOKEN).trim());
}

function ollamaCloudBasePath() {
  return (process.env.OLLAMA_CLOUD_BASE_PATH || "https://ollama.com").trim();
}

function ollamaCloudModel(localModel) {
  return (
    process.env.OLLAMA_CLOUD_MODEL_PREF ||
    localModel ||
    process.env.OLLAMA_MODEL_PREF ||
    "gpt-oss:120b"
  );
}

function isOllamaReachabilityError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  const cause = String(error?.cause?.message || error?.cause || "").toLowerCase();
  const combined = `${msg} ${cause}`;
  return (
    combined.includes("fetch failed") ||
    combined.includes("econnrefused") ||
    combined.includes("enotfound") ||
    combined.includes("etimedout") ||
    combined.includes("timed out") ||
    combined.includes("could not be reached") ||
    combined.includes("not responding") ||
    combined.includes("socket hang up") ||
    combined.includes("network")
  );
}

function createOllamaCloudClient(applyFetch) {
  const token = process.env.OLLAMA_AUTH_TOKEN;
  if (!token || !String(token).trim()) return null;
  return new Ollama({
    host: ollamaCloudBasePath(),
    headers: { Authorization: `Bearer ${token}` },
    fetch: typeof applyFetch === "function" ? applyFetch() : fetch,
  });
}

/**
 * Run a local Ollama chat request; on reachability errors retry via Ollama Cloud.
 * @param {object} params
 * @param {import("ollama").Ollama} params.localClient
 * @param {string} params.model
 * @param {object} params.options - arguments for client.chat()
 * @param {Function} [params.applyFetch]
 * @param {Function} [params.log]
 */
async function ollamaChatWithCloudFallback({
  localClient,
  model,
  options,
  applyFetch,
  log,
}) {
  try {
    return await localClient.chat(options);
  } catch (error) {
    if (!ollamaCloudFallbackEnabled() || !isOllamaReachabilityError(error)) {
      throw error;
    }

    const cloudClient = createOllamaCloudClient(applyFetch);
    if (!cloudClient) throw error;

    const cloudModel = ollamaCloudModel(model);
    log?.(
      `Local Ollama unavailable (${error.message}); falling back to Ollama Cloud (${cloudModel})`
    );

    return await cloudClient.chat({ ...options, model: cloudModel });
  }
}

module.exports = {
  ollamaCloudFallbackEnabled,
  ollamaCloudBasePath,
  ollamaCloudModel,
  isOllamaReachabilityError,
  createOllamaCloudClient,
  ollamaChatWithCloudFallback,
};
