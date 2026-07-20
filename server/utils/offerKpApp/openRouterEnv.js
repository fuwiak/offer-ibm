/**
 * OpenRouter API key from Railway aliases.
 * Supports both OPENROUTER_API_KEY and OPEN_ROUTER_TOKEN.
 */
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
/** Local reverse-SSH egress proxy (see scripts/openrouter-egress-proxy.cjs). */
const DEFAULT_EGRESS_PROXY_BASE_URL = "http://127.0.0.1:8787/api/v1";

let egressEnsurePromise = null;
/** Last /models probe result — shared so sync getLLMProvider can skip dead egress. */
let lastProbeOk = null;
let lastProbeAt = 0;

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

function isLocalEgressBaseUrl(baseUrl = resolveOpenRouterBaseUrl()) {
  return /127\.0\.0\.1:8787|localhost:8787/i.test(String(baseUrl || ""));
}

/**
 * Sync hint for teacher short-circuit.
 * Local egress defaults to unreachable until a successful probe (tunnel is
 * usually down on Selectel). Stale negative probes stay negative until refreshed.
 */
function isOpenRouterLikelyReachable({ maxAgeMs = 60_000 } = {}) {
  if (lastProbeAt === 0) {
    return !isLocalEgressBaseUrl();
  }
  if (Date.now() - lastProbeAt > maxAgeMs && isLocalEgressBaseUrl()) {
    // Stale: keep treating local egress as down so we don't flap back to OR.
    return lastProbeOk === true;
  }
  return lastProbeOk === true;
}

function getCachedOpenRouterReachable() {
  return { ok: lastProbeOk, at: lastProbeAt };
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

function isOpenRouterConnectionError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  const cause = String(
    error?.cause?.message || error?.cause?.code || ""
  ).toLowerCase();
  const code = String(error?.code || error?.cause?.code || "").toUpperCase();
  return (
    msg.includes("connection error") ||
    msg.includes("fetch failed") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket") ||
    msg.includes("access denied by security policy") ||
    cause.includes("other side closed") ||
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "UND_ERR_SOCKET",
      "UND_ERR_CONNECT_TIMEOUT",
    ].includes(code)
  );
}

/**
 * Enrich opaque OpenAI SDK "Connection error." with egress / geo-block hints.
 */
function formatOpenRouterConnectionError(error, baseUrl = null) {
  const base = baseUrl || resolveOpenRouterBaseUrl();
  const raw = String(error?.message || error || "Connection error");
  const usingEgress = isLocalEgressBaseUrl(base);
  const usingDirect = /openrouter\.ai/i.test(base);

  if (!isOpenRouterConnectionError(error) && !/connection error/i.test(raw)) {
    return raw;
  }

  if (usingEgress) {
    return (
      `${raw} (OpenRouter via egress ${base}). ` +
      `Tunnel/proxy down — chat should fall back to LM Studio. ` +
      `If you still see this, a code path skipped the probe. ` +
      `Restore tunnel: on an EU host run ` +
      `node scripts/openrouter-egress-proxy.cjs && ` +
      `ssh -N -R 127.0.0.1:8787:127.0.0.1:8787 root@87.228.90.43`
    );
  }
  if (usingDirect) {
    return (
      `${raw} (direct ${base}). Selectel RU is often geo-blocked by OpenRouter — ` +
      `set OPENROUTER_BASE_URL=http://127.0.0.1:8787/api/v1 and run the egress proxy ` +
      `(see docker/LAINEY_UI.md).`
    );
  }
  return `${raw} (OpenRouter base ${base})`;
}

/**
 * Cheap reachability probe against OpenRouter-compatible /models.
 * @param {string} [baseUrl]
 * @param {number} [timeoutMs]
 */
async function probeOpenRouterReachable(
  baseUrl = resolveOpenRouterBaseUrl(),
  timeoutMs = 2500
) {
  const base = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) {
    lastProbeOk = false;
    lastProbeAt = Date.now();
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      "Content-Type": "application/json",
      ...resolveOpenRouterHeaders(),
    };
    const key = resolveOpenRouterApiKey();
    if (key) headers.Authorization = `Bearer ${key}`;

    const res = await fetch(`${base}/models`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    // 401/403 still means TCP+TLS reached something (or a blocking proxy).
    // Treat 5xx / network throw as unreachable.
    if (res.status >= 500) {
      lastProbeOk = false;
      lastProbeAt = Date.now();
      return false;
    }
    // Selectel geo-block often returns 403 HTML "Access denied by security policy".
    if (res.status === 403) {
      const text = (await res.text().catch(() => "")).toLowerCase();
      if (text.includes("access denied") || text.includes("security policy")) {
        lastProbeOk = false;
        lastProbeAt = Date.now();
        return false;
      }
    }
    lastProbeOk = true;
    lastProbeAt = Date.now();
    return true;
  } catch {
    lastProbeOk = false;
    lastProbeAt = Date.now();
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * If OPENROUTER_BASE_URL is unset, prefer local egress proxy when it answers.
 * Idempotent; safe to call on every chat resolve.
 */
async function ensureOpenRouterEgressBaseUrl() {
  if (egressEnsurePromise) return egressEnsurePromise;
  egressEnsurePromise = (async () => {
    applyOpenRouterEnvAliases();
    const configured = String(process.env.OPENROUTER_BASE_URL || "").trim();
    if (configured) return resolveOpenRouterBaseUrl();

    const local = DEFAULT_EGRESS_PROXY_BASE_URL;
    if (await probeOpenRouterReachable(local, 800)) {
      process.env.OPENROUTER_BASE_URL = local;
      console.log(
        `\x1b[36m[OpenRouter]\x1b[0m using local egress proxy ${local}`
      );
      return local;
    }
    return DEFAULT_OPENROUTER_BASE_URL;
  })().catch(() => DEFAULT_OPENROUTER_BASE_URL);

  return egressEnsurePromise;
}

/** Boot / recovery: refresh probe cache (and log clearly). */
async function warmOpenRouterReachabilityProbe() {
  applyOpenRouterEnvAliases();
  const base = resolveOpenRouterBaseUrl();
  const ok = await probeOpenRouterReachable(base, 2500);
  const tag = ok ? "reachable" : "UNREACHABLE → prefer LM Studio";
  console.log(`\x1b[36m[OpenRouter]\x1b[0m probe ${base} → ${tag}`);
  return ok;
}

/** Test helper — reset egress auto-detect memo. */
function resetOpenRouterEgressCache() {
  egressEnsurePromise = null;
  lastProbeOk = null;
  lastProbeAt = 0;
}

module.exports = {
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_EGRESS_PROXY_BASE_URL,
  resolveOpenRouterApiKey,
  resolveOpenRouterBaseUrl,
  resolveOpenRouterHeaders,
  applyOpenRouterEnvAliases,
  isLocalEgressBaseUrl,
  isOpenRouterLikelyReachable,
  getCachedOpenRouterReachable,
  isOpenRouterConnectionError,
  formatOpenRouterConnectionError,
  probeOpenRouterReachable,
  ensureOpenRouterEgressBaseUrl,
  warmOpenRouterReachabilityProbe,
  resetOpenRouterEgressCache,
};
