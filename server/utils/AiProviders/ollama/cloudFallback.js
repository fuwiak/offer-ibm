const { Ollama } = require("ollama");

function ollamaCloudFallbackEnabled() {
  const flag = String(process.env.OLLAMA_CLOUD_FALLBACK ?? "0")
    .trim()
    .toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") return false;
  return !!(
    process.env.OLLAMA_AUTH_TOKEN && String(process.env.OLLAMA_AUTH_TOKEN).trim()
  );
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

async function isLocalOllamaReachable(localClient) {
  if (!localClient) return false;
  try {
    await localClient.list();
    return true;
  } catch {
    return false;
  }
}

function cloudChatOptions(options = {}) {
  const cloudOptions = { ...options };
  // Ollama Cloud chat API may reject native tool payloads — keep stream/text only.
  delete cloudOptions.tools;
  return cloudOptions;
}

async function* consumeChatStream(client, options, model) {
  const stream = await client.chat({
    ...options,
    model: model || options.model,
    stream: true,
  });
  for await (const chunk of stream) {
    yield chunk;
  }
}

/**
 * Run an Ollama API call locally; on reachability errors retry via Ollama Cloud.
 */
async function ollamaRequestWithCloudFallback({
  localClient,
  model,
  request,
  applyFetch,
  log,
}) {
  try {
    return await request(localClient, model);
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

    return await request(cloudClient, cloudModel);
  }
}

/**
 * Chat with cloud fallback. Streaming requests wrap the async iterator so
 * connection errors on the first chunk still trigger cloud retry (Ollama returns
 * the generator before the HTTP connection completes).
 */
async function ollamaChatWithCloudFallback({
  localClient,
  model,
  options,
  applyFetch,
  log,
}) {
  if (!options?.stream) {
    return ollamaRequestWithCloudFallback({
      localClient,
      model,
      applyFetch,
      log,
      request: (client, resolvedModel) =>
        client.chat({ ...options, model: resolvedModel || options.model }),
    });
  }

  async function* streamWithFallback() {
    try {
      yield* consumeChatStream(localClient, options, model);
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

      yield* consumeChatStream(
        cloudClient,
        cloudChatOptions(options),
        cloudModel
      );
    }
  }

  return streamWithFallback();
}

async function ollamaListWithCloudFallback({
  localClient,
  model,
  applyFetch,
  log,
}) {
  return ollamaRequestWithCloudFallback({
    localClient,
    model,
    applyFetch,
    log,
    request: (client) => client.list(),
  });
}

async function ollamaShowWithCloudFallback({
  localClient,
  model,
  applyFetch,
  log,
}) {
  return ollamaRequestWithCloudFallback({
    localClient,
    model,
    applyFetch,
    log,
    request: (client, resolvedModel) => client.show({ model: resolvedModel }),
  });
}

module.exports = {
  ollamaCloudFallbackEnabled,
  ollamaCloudBasePath,
  ollamaCloudModel,
  isOllamaReachabilityError,
  isLocalOllamaReachable,
  createOllamaCloudClient,
  ollamaRequestWithCloudFallback,
  ollamaChatWithCloudFallback,
  ollamaListWithCloudFallback,
  ollamaShowWithCloudFallback,
};
