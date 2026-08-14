"use strict";

/**
 * Inkrementalny sync ShopDB → Elasticsearch.
 *
 * Prosty wariant docelowej architektury CDC: cron co 1–5 min woła
 * syncElasticCatalog(), które indeksuje tylko produkty zmienione od
 * ostatniego syncu (edit_datetime/create_datetime > lastSync). Pełny
 * rebuild: syncElasticCatalog({ full: true }).
 *
 * Dokument ES niesie WYŁĄCZNIE dane wyszukiwania/rankingu: nazwę, SKU,
 * kategorię, opis, wyekstrahowaną sygnaturę (standard/diameter/length).
 * Cena i stan magazynu celowo NIE są indeksowane — ShopDB = source of
 * truth, hydrate po ID przy każdym trafieniu.
 *
 * Stan lastSync: STORAGE_DIR/offer-kp-elastic/last-sync.json.
 *
 * CLI: node utils/offerKp/connectors/elasticSync.js [--full]
 */

const fs = require("fs");
const path = require("path");
const { query } = require("../db/client");
const {
  TABLES,
  PRODUCT_COLUMNS: P,
  CATEGORY_COLUMNS: C,
  SKU_COLUMNS: S,
} = require("../db/schema");
const { parseHardwareQuery } = require("../hardwareQuery");
const {
  elasticEnabled,
  elasticIndexName,
  esFetch,
} = require("./elasticSearch");
const shopDbLog = require("../shopDbLog");

const SYNC_BATCH_SIZE = Math.max(
  50,
  parseInt(process.env.OFFER_KP_ES_SYNC_BATCH, 10) || 500
);

function syncStateDir() {
  const base = process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : path.resolve(__dirname, "../../../storage");
  return path.join(base, "offer-kp-elastic");
}

function syncStatePath() {
  return path.join(syncStateDir(), "last-sync.json");
}

function readLastSync() {
  try {
    const raw = JSON.parse(fs.readFileSync(syncStatePath(), "utf8"));
    return typeof raw?.lastSync === "string" ? raw.lastSync : null;
  } catch {
    return null;
  }
}

function writeLastSync(iso) {
  fs.mkdirSync(syncStateDir(), { recursive: true });
  fs.writeFileSync(
    syncStatePath(),
    JSON.stringify({ lastSync: iso, index: elasticIndexName() }, null, 2)
  );
}

const INDEX_MAPPING = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    analysis: {
      analyzer: {
        offerkp_text: {
          type: "custom",
          tokenizer: "standard",
          filter: ["lowercase"],
        },
      },
    },
  },
  mappings: {
    properties: {
      name: { type: "text", analyzer: "offerkp_text" },
      sku: { type: "text", analyzer: "offerkp_text" },
      summary: { type: "text", analyzer: "offerkp_text" },
      description: { type: "text", analyzer: "offerkp_text" },
      category_name: { type: "text", analyzer: "offerkp_text" },
      search_text: { type: "text", analyzer: "offerkp_text" },
      standard: { type: "text", analyzer: "offerkp_text" },
      type: { type: "keyword" },
      diameter: { type: "float" },
      length: { type: "float" },
      updated_at: { type: "date" },
    },
  },
};

/** Create the index with mapping when missing. Idempotent. */
async function ensureElasticIndex() {
  const index = encodeURIComponent(elasticIndexName());
  try {
    await esFetch(`/${index}`);
    return { created: false };
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
  await esFetch(`/${index}`, { method: "PUT", body: INDEX_MAPPING });
  return { created: true };
}

/** Extract search signature from the catalog name (same parser as matching). */
function buildElasticDocument(row) {
  const name = String(row.name || "").trim();
  const parsed = parseHardwareQuery(name);
  const din = parsed?.dinNumbers?.[0] || null;
  const diameter = parsed?.thread?.size ?? parsed?.diameter ?? null;
  const length = parsed?.thread?.length ?? null;
  return {
    name,
    sku: String(row.sku || "").trim() || null,
    summary: String(row.summary || "").trim() || null,
    description:
      String(row.description || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2000) || null,
    category_name: String(row.category_name || "").trim() || null,
    search_text: [name, row.sku, row.category_name].filter(Boolean).join(" "),
    standard: din ? `DIN ${din}` : null,
    type: parsed?.productTypes?.[0] || null,
    diameter: diameter != null ? Number(diameter) : null,
    length: length != null ? Number(length) : null,
    updated_at: new Date().toISOString(),
  };
}

async function fetchChangedProducts(sinceIso, limit, offset) {
  const params = [];
  let where = `p.${P.status} = 1`;
  if (sinceIso) {
    // Shop-Script keeps edit_datetime/create_datetime on shop_product.
    where += ` AND (p.edit_datetime > ? OR p.create_datetime > ?)`;
    params.push(sinceIso, sinceIso);
  }
  const sql = `
    SELECT
      p.${P.id} AS id,
      p.${P.name} AS name,
      p.${P.summary} AS summary,
      p.${P.description} AS description,
      c.${C.name} AS category_name,
      (
        SELECT s.${S.sku} FROM ${TABLES.productSkus} s
        WHERE s.${S.productId} = p.${P.id}
        ORDER BY s.${S.sort} ASC LIMIT 1
      ) AS sku
    FROM ${TABLES.product} p
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE ${where}
    ORDER BY p.${P.id} ASC
    LIMIT ${Math.max(1, limit)} OFFSET ${Math.max(0, offset)}
  `;
  return query(sql, params);
}

async function bulkIndex(rows) {
  if (!rows.length) return 0;
  const index = elasticIndexName();
  const lines = [];
  for (const row of rows) {
    lines.push(
      JSON.stringify({ index: { _index: index, _id: String(row.id) } })
    );
    lines.push(JSON.stringify(buildElasticDocument(row)));
  }
  const body = `${lines.join("\n")}\n`;
  const result = await esFetch("/_bulk", { method: "POST", body });
  if (result?.errors) {
    const firstError = (result.items || []).find((i) => i?.index?.error);
    throw new Error(
      `ES bulk index errors: ${firstError?.index?.error?.reason || "unknown"}`
    );
  }
  return rows.length;
}

/**
 * @param {{ full?: boolean }} [opts]
 * @returns {Promise<{ indexed: number, full: boolean, lastSync: string }>}
 */
async function syncElasticCatalog({ full = false } = {}) {
  if (!elasticEnabled()) {
    return { indexed: 0, full, lastSync: readLastSync(), skipped: true };
  }
  await ensureElasticIndex();
  const sinceIso = full ? null : readLastSync();
  const startedAt = new Date().toISOString();
  let indexed = 0;
  let offset = 0;
  for (;;) {
    const rows = await fetchChangedProducts(sinceIso, SYNC_BATCH_SIZE, offset);
    if (!rows.length) break;
    indexed += await bulkIndex(rows);
    offset += rows.length;
    if (rows.length < SYNC_BATCH_SIZE) break;
  }
  writeLastSync(startedAt);
  shopDbLog.ok("elastic sync finished", {
    indexed,
    full: !!(full || !sinceIso),
    since: sinceIso,
  });
  return { indexed, full: !!(full || !sinceIso), lastSync: startedAt };
}

if (require.main === module) {
  syncElasticCatalog({ full: process.argv.includes("--full") })
    .then((result) => {
      console.log(JSON.stringify(result));
      process.exit(0);
    })
    .catch((error) => {
      console.error("[elasticSync]", error?.message || error);
      process.exit(1);
    });
}

module.exports = {
  SYNC_BATCH_SIZE,
  INDEX_MAPPING,
  ensureElasticIndex,
  buildElasticDocument,
  syncElasticCatalog,
  readLastSync,
  writeLastSync,
};
