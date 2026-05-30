/**
 * Обогащение RAG-контекста результатами метапоиска SearXNG.
 *
 * Используется как РЕЗЕРВ (fallback) к ГАРАНТ: запускается только когда ГАРАНТ
 * не вернул ни одного результата (см. collectExternalContexts в generation.js).
 *
 * Требуется self-hosted SearXNG с включённым JSON-форматом (settings.yml:
 * search.formats: [html, json]). Адрес задаётся через SEARXNG_FALLBACK_API_URL
 * и должен указывать на endpoint поиска, например:
 *   http://searxng.railway.internal:8080/search
 *   https://searxng.example.com/search
 *
 * Возвращает { contextTexts, sources, flags } в формате apiChatHandler / Citation UI.
 */

const { v4: uuidv4 } = require("uuid");

const MAX_EXCERPT_CHARS = 1200;
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function searxngBaseUrl() {
  return (process.env.SEARXNG_FALLBACK_API_URL || "").trim();
}

function isConfigured() {
  return !!searxngBaseUrl();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Builds the SearXNG JSON search URL with sensible defaults for RU legal content.
 * @param {string} query
 * @returns {URL}
 */
function buildSearchUrl(query) {
  const url = new URL(searxngBaseUrl());
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  const language = (process.env.SEARXNG_LANGUAGE || "ru-RU").trim();
  if (language) url.searchParams.set("language", language);
  const categories = (process.env.SEARXNG_CATEGORIES || "").trim();
  if (categories) url.searchParams.set("categories", categories);
  const timeRange = (process.env.SEARXNG_TIME_RANGE || "").trim();
  if (timeRange) url.searchParams.set("time_range", timeRange);
  return url;
}

/**
 * Fetches SearXNG results as JSON with retries + timeout. Never throws.
 * @param {string} query
 * @returns {Promise<object|null>}
 */
async function fetchSearxng(query) {
  const retries = clampInt(process.env.SEARXNG_FETCH_RETRIES, 1, 6, 3);
  const timeoutMs = clampInt(
    process.env.SEARXNG_TIMEOUT_MS,
    3000,
    60000,
    15000
  );
  const url = buildSearchUrl(query).toString();

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(8000, 350 * 2 ** (attempt - 1));
      await sleep(delay);
      console.log("[SearXNG] retry", { attempt: attempt + 1, delayMs: delay });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "offer-kp",
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const retry = RETRY_STATUSES.has(res.status);
        console.warn("[SearXNG] HTTP error", {
          status: res.status,
          statusText: res.statusText,
          retry,
          attempt: attempt + 1,
        });
        if (retry && attempt < retries - 1) continue;
        return null;
      }
      const data = await res.json();
      const count = Array.isArray(data?.results) ? data.results.length : 0;
      console.log("[SearXNG] response", { count });
      return data;
    } catch (e) {
      console.warn("[SearXNG] request failed:", e?.message || e, {
        attempt: attempt + 1,
      });
      if (attempt < retries - 1) continue;
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function cleanText(text) {
  if (!text || typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim();
}

/**
 * @param {string} message
 * @param {{ maxResults?: number }} [options]
 * @returns {Promise<{ contextTexts: string[], sources: object[], flags: object }>}
 */
async function getSearxngContext(message, options = {}) {
  const contextTexts = [];
  const sources = [];
  const flags = {
    searxngConfigured: isConfigured(),
    searxngResultCount: 0,
    searxngFallbackUsed: true,
  };

  if (!isConfigured() || !message || !String(message).trim()) {
    flags.searxngSkipped = true;
    return { contextTexts, sources, flags };
  }

  const maxResults =
    options.maxResults != null
      ? Math.min(10, Math.max(1, options.maxResults))
      : clampInt(process.env.SEARXNG_FALLBACK_RESULTS, 1, 10, 5);

  console.log("[SearXNG] enrich start (fallback)", {
    messageLen: String(message).length,
    maxResults,
  });

  const data = await fetchSearxng(String(message).slice(0, 4096));
  const results = Array.isArray(data?.results)
    ? data.results.slice(0, maxResults)
    : [];
  flags.searxngResultCount = results.length;

  const tag = "[ВЕБ-ПОИСК · SearXNG · резерв (ГАРАНТ без результатов)]";
  for (let i = 0; i < results.length; i++) {
    const r = results[i] || {};
    const url = r.url || "";
    if (!url) continue;
    const title = cleanText(r.title) || url;
    let excerpt = cleanText(r.content) || title;
    if (excerpt.length > MAX_EXCERPT_CHARS)
      excerpt = excerpt.slice(0, MAX_EXCERPT_CHARS) + "...";
    const published = cleanText(r.publishedDate);

    const id = `searxng-${i}-${uuidv4().slice(0, 8)}`;
    contextTexts.push(
      `${tag} ${title}\nСсылка: ${url}\n${excerpt}` +
        (published ? `\n(дата: ${published})` : "")
    );
    sources.push({
      id,
      title,
      text: excerpt.slice(0, 1000) + (excerpt.length > 1000 ? "..." : ""),
      chunkSource: `link://${url}`,
      url,
      docSource: "SearXNG",
      score: 1,
      searxngEngine: r.engine || null,
    });
  }

  console.log("[SearXNG] enrich done", {
    contextChunks: contextTexts.length,
    sourcesCount: sources.length,
  });
  return { contextTexts, sources, flags };
}

module.exports = {
  getSearxngContext,
  isSearxngFallbackConfigured: isConfigured,
};
