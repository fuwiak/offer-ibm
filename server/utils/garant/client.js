/**
 * Client for Garant Connect API (https://api.garant.ru).
 * Used to search documents and optionally fetch excerpts for RAG context.
 * Token via process.env.GARANT_TOKEN. On API errors returns empty results (no throw).
 */

const GARANT_BASE_URL = "https://api.garant.ru/v2";

const GARANT_FETCH_RETRIES = Math.min(
  6,
  Math.max(1, parseInt(process.env.GARANT_FETCH_RETRIES, 10) || 3)
);

const GARANT_RETRY_STATUSES = new Set([408, 423, 429, 502, 503, 504]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getHeaders() {
  const token = process.env.GARANT_TOKEN;
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * POST to Garant API with JSON body. On non-2xx returns null; caller should handle.
 * @param {string} path - e.g. "/search"
 * @param {object} body - JSON body
 * @returns {Promise<object|null>}
 */
async function _post(path, body) {
  const token = process.env.GARANT_TOKEN;
  if (!token) return null;
  const url = `${GARANT_BASE_URL}${path}`;
  const bodyKeys =
    body && typeof body === "object" ? Object.keys(body).join(",") : "";
  console.log("[Garant] API request", { path, bodyKeys });
  let lastStatus = 0;
  for (let attempt = 0; attempt < GARANT_FETCH_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(8000, 350 * 2 ** (attempt - 1));
        await sleep(delay);
        console.log("[Garant] POST retry", { path, attempt: attempt + 1, delayMs: delay });
      }
      const res = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      lastStatus = res.status;
      if (!res.ok) {
        const retry = GARANT_RETRY_STATUSES.has(res.status);
        console.warn("[Garant] API error", {
          path,
          status: res.status,
          statusText: res.statusText,
          retry,
          attempt: attempt + 1,
        });
        if (retry && attempt < GARANT_FETCH_RETRIES - 1) continue;
        return null;
      }
      const data = await res.json();
      const docCount = Array.isArray(data?.documents)
        ? data.documents.length
        : data?.items?.length ?? "-";
      console.log("[Garant] API response", { path, docCount });
      return data;
    } catch (err) {
      console.warn("[Garant] request failed:", err?.message || err, {
        path,
        attempt: attempt + 1,
      });
      if (attempt < GARANT_FETCH_RETRIES - 1) continue;
      return null;
    }
  }
  console.warn("[Garant] POST exhausted retries", { path, lastStatus });
  return null;
}

/**
 * GET from Garant API. On non-2xx returns null.
 * @param {string} path - e.g. "/topic/12345/html"
 * @returns {Promise<object|null>}
 */
async function _get(path) {
  const token = process.env.GARANT_TOKEN;
  if (!token) return null;
  const url = `${GARANT_BASE_URL}${path}`;
  console.log("[Garant] API request", { path, method: "GET" });
  let lastStatus = 0;
  for (let attempt = 0; attempt < GARANT_FETCH_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(8000, 350 * 2 ** (attempt - 1));
        await sleep(delay);
        console.log("[Garant] GET retry", { path, attempt: attempt + 1, delayMs: delay });
      }
      const res = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });
      lastStatus = res.status;
      if (!res.ok) {
        const retry = GARANT_RETRY_STATUSES.has(res.status);
        console.warn("[Garant] API error", {
          path,
          status: res.status,
          statusText: res.statusText,
          retry,
          attempt: attempt + 1,
        });
        if (retry && attempt < GARANT_FETCH_RETRIES - 1) continue;
        return null;
      }
      const data = await res.json();
      const itemCount = Array.isArray(data?.items) ? data.items.length : "-";
      console.log("[Garant] API response", { path, itemCount });
      return data;
    } catch (err) {
      console.warn("[Garant] request failed:", err?.message || err, {
        path,
        attempt: attempt + 1,
      });
      if (attempt < GARANT_FETCH_RETRIES - 1) continue;
      return null;
    }
  }
  console.warn("[Garant] GET exhausted retries", { path, lastStatus });
  return null;
}

/**
 * Search documents in Garant.
 * @param {string} text - Search phrase (max 16KB)
 * @param {object} options - { page, env, sort, sortOrder, isQuery }
 * @returns {Promise<{ documents: object[], totalDocs?: number, totalPages?: number, page?: number }>}
 */
async function search(text, options = {}) {
  const {
    page = 1,
    env = "internet",
    sort = 0,
    sortOrder = 0,
    isQuery = false,
  } = options;
  const body = {
    text: String(text || "").slice(0, 16 * 1024),
    page,
    env,
    sort,
    sortOrder,
  };
  if (isQuery) body.isQuery = true;
  const data = await _post("/search", body);
  if (!data || !Array.isArray(data.documents))
    return { documents: [], totalDocs: 0, totalPages: 0, page: 1 };
  return {
    documents: data.documents,
    totalDocs: data.totalDocs ?? 0,
    totalPages: data.totalPages ?? 0,
    page: data.page ?? page,
  };
}

/**
 * Get document content as HTML pages (array of { number, text }).
 * @param {number} topic - Document id from search
 * @returns {Promise<{ items: { number: number, text: string }[] }>}
 */
async function getTopicHtml(topic) {
  const data = await _get(`/topic/${topic}/html`);
  if (!data || !Array.isArray(data.items)) return { items: [] };
  return { items: data.items };
}

/**
 * Метаданные документа (в т.ч. status: «Действующие» / «Утратившие силу»).
 * @param {number} topic
 * @returns {Promise<object|null>}
 */
async function getTopicInfo(topic) {
  const id = Number(topic);
  if (!Number.isFinite(id)) return null;
  const data = await _get(`/topic/${id}`);
  if (!data || typeof data !== "object") return null;
  return data;
}

/**
 * Sutyazhnik: search judicial practice by document text.
 * @param {string} text - Document/text to match
 * @param {object} options - { count, kind } kind e.g. ["301","302"]
 * @returns {Promise<{ documents: object[] }>}
 */
async function sutyazhnikSearch(text, options = {}) {
  const token = process.env.GARANT_TOKEN;
  if (!token) return { documents: [] };
  const { count = 10, kind = ["301", "302"] } = options;
  const body = {
    text: String(text || ""),
    count: Math.min(1000, Math.max(1, count)),
    kind: Array.isArray(kind) ? kind : ["301", "302"],
  };
  const url = `${GARANT_BASE_URL}/sutyazhnik-search`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      console.warn(
        "[Garant] sutyazhnik-search: 401 Unauthorized — для токена не подключён банк судебной практики или истёк срок."
      );
      return { documents: [] };
    }
    if (!res.ok) {
      console.warn("[Garant] sutyazhnik-search HTTP", res.status, res.statusText);
      return { documents: [] };
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.documents)) return { documents: [] };
    return { documents: data.documents };
  } catch (e) {
    console.warn("[Garant] sutyazhnik-search failed:", e?.message || e);
    return { documents: [] };
  }
}

module.exports = {
  search,
  getTopicHtml,
  getTopicInfo,
  sutyazhnikSearch,
};
