"use strict";

/**
 * Elasticsearch — SEARCH INDEX, nie source of truth.
 *
 * Architektura (etap 1):
 *   query → Elasticsearch (BM25 + filters) → top-N productId
 *         → ShopDB `WHERE id IN (...)` → live name/price/stock
 *
 * ES zastępuje generyczne strategie LIKE/REGEXP (product_fields, category,
 * search_index). Deterministyczne strategie (structured, exact SKU) zostają
 * w SQL. Ceny NIGDY nie schodzą z dokumentu ES — indeks jest near-real-time
 * i może być nieaktualny; wiersze zawsze hydratowane z ShopDB po ID.
 *
 * Wyłączony domyślnie: OFFER_KP_ELASTICSEARCH=1 włącza. Każdy błąd ES
 * (connection refused, timeout, circuit open) → null → caller wraca do
 * pełnego SQL fan-outu. Graceful fallback, nie blokuj pipeline'u.
 */

const { query } = require("../db/client");
const {
  TABLES,
  PRODUCT_COLUMNS: P,
  CATEGORY_COLUMNS: C,
} = require("../db/schema");
const { resilientCall, getCircuitBreaker } = require("./resilientCall");
const shopDbLog = require("../shopDbLog");

const ES_INDEX_VERSION = "v1";

function elasticEnabled() {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.OFFER_KP_ELASTICSEARCH || "")
      .trim()
      .toLowerCase()
  );
}

function elasticBaseUrl() {
  return String(process.env.ELASTICSEARCH_URL || "http://127.0.0.1:9200")
    .trim()
    .replace(/\/$/, "");
}

function elasticIndexName() {
  return (
    String(process.env.OFFER_KP_ES_INDEX || "").trim() ||
    `offerkp-products-${ES_INDEX_VERSION}`
  );
}

function elasticHeaders() {
  const headers = { "Content-Type": "application/json" };
  const apiKey = String(process.env.ELASTICSEARCH_API_KEY || "").trim();
  if (apiKey) headers.Authorization = `ApiKey ${apiKey}`;
  return headers;
}

function elasticTimeoutMs() {
  const n = parseInt(process.env.OFFER_KP_ES_TIMEOUT_MS, 10);
  if (Number.isFinite(n) && n >= 200) return Math.min(n, 30_000);
  return 3_000;
}

const elasticCircuit = getCircuitBreaker("elasticsearch", {
  failureThreshold: 3,
  cooldownMs: 60_000,
});

/**
 * Low-level ES REST call with timeout + retry + circuit breaker.
 * @param {string} path e.g. "/offerkp-products-v1/_search"
 * @param {{ method?: string, body?: object|string }} [opts]
 * @returns {Promise<object>} parsed JSON body (throws on HTTP/network error)
 */
async function esFetch(path, opts = {}) {
  const url = `${elasticBaseUrl()}${path}`;
  const method = opts.method || "GET";
  const body =
    opts.body == null
      ? undefined
      : typeof opts.body === "string"
        ? opts.body
        : JSON.stringify(opts.body);
  return resilientCall(
    async () => {
      const response = await fetch(url, {
        method,
        headers: elasticHeaders(),
        body,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(
          json?.error?.reason || `ES HTTP ${response.status} ${path}`
        );
        err.status = response.status;
        throw err;
      }
      return json;
    },
    {
      name: `elasticsearch:${method} ${path.split("?")[0]}`,
      timeoutMs: elasticTimeoutMs(),
      retries: 1,
      backoffMs: 150,
      circuit: elasticCircuit,
    }
  );
}

/**
 * Hybrid lexical query: BM25 multi_match over text fields + hard filters
 * from the parsed hardware signature (diameter/length/standard) when the
 * synced documents carry them. Filters use `should` + boost, not `must` —
 * the index may hold products without extracted specs and a hard `must`
 * would silently hide them.
 * @param {string[]} terms
 * @param {object} parsed parseHardwareQuery() output
 * @param {number} size
 */
function buildElasticQuery(terms, parsed = {}, size = 20) {
  const text = (Array.isArray(terms) ? terms : [terms])
    .filter(Boolean)
    .join(" ")
    .trim();
  const should = [];
  if (text) {
    should.push({
      multi_match: {
        query: text,
        fields: [
          "name^4",
          "sku^3",
          "category_name^2",
          "summary",
          "description",
          "search_text",
        ],
        type: "most_fields",
        operator: "or",
      },
    });
  }
  for (const din of parsed?.dinNumbers || []) {
    should.push({
      match_phrase: { standard: { query: `DIN ${din}`, boost: 6 } },
    });
    should.push({ match_phrase: { name: { query: `DIN ${din}`, boost: 4 } } });
  }
  const diameter = parsed?.thread?.size ?? parsed?.diameter;
  if (diameter != null && String(diameter).trim() !== "") {
    should.push({ term: { diameter: { value: Number(diameter), boost: 5 } } });
  }
  const length = parsed?.thread?.length;
  if (length != null && String(length).trim() !== "") {
    should.push({ term: { length: { value: Number(length), boost: 5 } } });
  }
  return {
    size: Math.max(1, Math.min(200, Number(size) || 20)),
    _source: false,
    query: { bool: { should, minimum_should_match: 1 } },
  };
}

/**
 * Tight DIN + diameter + length filter for RFQ lines.
 * Local ES (~ms) instead of remote ShopDB REGEXP per line.
 */
function buildPreciseElasticQuery(parsed = {}, size = 20) {
  const filter = [];
  const dins = (parsed?.dinNumbers || [])
    .map((d) => String(d || "").trim())
    .filter(Boolean);
  if (dins.length) {
    filter.push({
      bool: {
        should: dins.flatMap((din) => [
          { match_phrase: { standard: `DIN ${din}` } },
          { match_phrase: { name: din } },
        ]),
        minimum_should_match: 1,
      },
    });
  }
  const diameter = parsed?.thread?.size ?? parsed?.diameter;
  if (diameter != null && String(diameter).trim() !== "") {
    filter.push({ term: { diameter: Number(diameter) } });
  }
  const length = parsed?.thread?.length ?? parsed?.dimensions?.b;
  if (length != null && String(length).trim() !== "") {
    filter.push({ term: { length: Number(length) } });
  }
  if (!filter.length) return null;
  return {
    size: Math.max(1, Math.min(80, Number(size) || 20)),
    _source: false,
    query: { bool: { filter } },
  };
}

async function searchPreciseStructuredViaElastic(parsed, limit) {
  if (!elasticEnabled()) return null;
  const body = buildPreciseElasticQuery(parsed, Math.max(limit, 20));
  if (!body) return null;
  try {
    const result = await esFetch(
      `/${encodeURIComponent(elasticIndexName())}/_search`,
      { method: "POST", body }
    );
    const hits = result?.hits?.hits;
    if (!Array.isArray(hits) || !hits.length) return [];
    const ids = hits.map((h) => String(h._id)).filter(Boolean);
    return hydrateElasticHitsFromShopDb(ids.slice(0, Math.max(limit, 20)));
  } catch (error) {
    shopDbLog.skip(
      "elasticsearch precise search unavailable — SQL structured",
      {
        error: error?.message || String(error),
      }
    );
    return null;
  }
}

/**
 * ES → productIds. Nothing else leaves the index (no names, no prices).
 * @returns {Promise<Array<string>|null>} ids, or null = ES unavailable/disabled
 */
async function searchElasticProductIds(terms, parsed, limit) {
  if (!elasticEnabled()) return null;
  try {
    const body = buildElasticQuery(terms, parsed, Math.max(limit, 20));
    const result = await esFetch(
      `/${encodeURIComponent(elasticIndexName())}/_search`,
      { method: "POST", body }
    );
    const hits = result?.hits?.hits;
    if (!Array.isArray(hits)) return [];
    return hits.map((h) => String(h._id)).filter(Boolean);
  } catch (error) {
    shopDbLog.skip("elasticsearch unavailable — falling back to SQL", {
      error: error?.message || String(error),
    });
    return null;
  }
}

/**
 * Live ShopDB hydrate for ES hits: one PK lookup replaces the LIKE scans.
 * Row shape identical to the SQL strategies (mergeSearchHits-compatible).
 * @param {string[]} ids ES-ranked product ids (order preserved)
 */
async function hydrateElasticHitsFromShopDb(ids = []) {
  const clean = [
    ...new Set(ids.map((id) => String(id).trim()).filter(Boolean)),
  ];
  if (!clean.length) return [];
  const placeholders = clean.map(() => "?").join(", ");
  const sql = `
    SELECT
      p.${P.id} AS id,
      p.${P.name} AS name,
      p.${P.summary} AS summary,
      p.${P.description} AS description,
      p.${P.price} AS price,
      p.${P.currency} AS currency,
      p.${P.url} AS product_url,
      c.${C.name} AS category_name,
      c.${C.fullUrl} AS category_url,
      'elastic' AS match_source
    FROM ${TABLES.product} p
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE p.${P.status} = 1 AND p.${P.id} IN (${placeholders})
  `;
  const rows = await query(sql, clean);
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  // ES ranking is the ranking — restore its order after the unordered IN().
  return clean
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((r) => ({
      ...r,
      _tables: ["elasticsearch", TABLES.product, TABLES.category],
      _matchSources: ["elastic"],
      shopDbTables: ["elasticsearch", TABLES.product, TABLES.category],
      shopMatchSources: ["elastic"],
    }));
}

/**
 * Full etap-1 path: ES ranks, ShopDB hydrates. null = caller must fall back
 * to the SQL fan-out (ES disabled or down).
 */
async function searchProductsViaElastic(terms, parsed, limit) {
  const ids = await searchElasticProductIds(terms, parsed, limit);
  if (ids == null) return null;
  if (!ids.length) return [];
  return hydrateElasticHitsFromShopDb(ids.slice(0, Math.max(limit, 20)));
}

module.exports = {
  ES_INDEX_VERSION,
  elasticEnabled,
  elasticBaseUrl,
  elasticIndexName,
  elasticTimeoutMs,
  buildElasticQuery,
  buildPreciseElasticQuery,
  esFetch,
  searchElasticProductIds,
  hydrateElasticHitsFromShopDb,
  searchProductsViaElastic,
  searchPreciseStructuredViaElastic,
};
