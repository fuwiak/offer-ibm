/**
 * SQL-стратегии поиска товаров в MySQL (Webasyst Shop-Script).
 */

const { query } = require("./db/client");
const {
  TABLES,
  PRODUCT_COLUMNS: P,
  CATEGORY_COLUMNS: C,
  SKU_COLUMNS: S,
} = require("./db/schema");
const { PRODUCT_TYPE_ROOTS } = require("./hardwareQuery");

const PRODUCT_SELECT = `
  p.${P.id} AS id,
  p.${P.name} AS name,
  p.${P.summary} AS summary,
  p.${P.description} AS description,
  p.${P.price} AS price,
  p.${P.currency} AS currency,
  p.${P.url} AS product_url,
  c.${C.name} AS category_name,
  c.${C.fullUrl} AS category_url
`;

function sqlLimit(limit) {
  return Math.max(1, Math.min(50, parseInt(limit, 10) || 5));
}

function buildTermClause(columns, terms, params) {
  const likes = [];
  for (const term of terms) {
    const pattern = `%${term}%`;
    const parts = columns.map((col) => {
      params.push(pattern);
      return `${col} LIKE ?`;
    });
    likes.push(`(${parts.join(" OR ")})`);
  }
  return likes.join(" OR ");
}

function mapRows(rows, matchSource, tables) {
  return rows.map((r) => ({
    ...r,
    _tables: tables,
    _matchSources: [matchSource],
    shopDbTables: tables,
    shopMatchSources: [matchSource],
  }));
}

async function searchByStructuredQuery(parsed, limit) {
  const conditions = [`p.${P.status} = 1`];
  const params = [];

  if (
    !parsed.dinNumbers.length &&
    !parsed.productTypes.length &&
    !parsed.thread &&
    !parsed.dimensions
  ) {
    return [];
  }

  if (parsed.dinNumbers.length) {
    const dinParts = parsed.dinNumbers.map(() => `p.${P.name} LIKE ?`);
    params.push(...parsed.dinNumbers.map((d) => `%${d}%`));
    conditions.push(`(${dinParts.join(" OR ")})`);
  }

  if (parsed.productTypes.length) {
    const typeParts = [];
    for (const type of parsed.productTypes) {
      for (const root of PRODUCT_TYPE_ROOTS[type] || [type]) {
        typeParts.push(`p.${P.name} LIKE ?`);
        params.push(`%${root}%`);
      }
    }
    if (typeParts.length) conditions.push(`(${typeParts.join(" OR ")})`);
  }

  if (parsed.thread) {
    const { size, length } = parsed.thread;
    conditions.push(
      `(p.${P.name} LIKE ? OR p.${P.name} LIKE ? OR p.${P.name} LIKE ? OR p.${P.name} LIKE ?)`
    );
    params.push(
      `%M ${size}x${length}%`,
      `%M ${size} x ${length}%`,
      `%M${size}x${length}%`,
      `%M ${size}×${length}%`
    );
  }

  if (parsed.dimensions) {
    const { a, b, c } = parsed.dimensions;
    const dimPatterns = [
      c ? `%${a}x${b}x${c}%` : null,
      c ? `%${a} x ${b} x ${c}%` : null,
      `%${a}x${b}%`,
      `%${a} x ${b}%`,
    ].filter(Boolean);
    const dimParts = dimPatterns.map(() => `p.${P.name} LIKE ?`);
    params.push(...dimPatterns);
    conditions.push(`(${dimParts.join(" OR ")})`);
  }

  const sql = `
    SELECT ${PRODUCT_SELECT}, 'structured' AS match_source
    FROM ${TABLES.product} p
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE ${conditions.join(" AND ")}
    ORDER BY p.${P.totalSales} DESC, p.${P.id} DESC
    LIMIT ${sqlLimit(limit)}
  `;
  const rows = await query(sql, params);
  return mapRows(rows, "structured", [TABLES.product, TABLES.category]);
}

async function searchByProductFields(terms, limit) {
  const params = [];
  const clause = buildTermClause(
    [`p.${P.name}`, `p.${P.summary}`, `p.${P.description}`],
    terms,
    params
  );
  const sql = `
    SELECT ${PRODUCT_SELECT}, 'product' AS match_source
    FROM ${TABLES.product} p
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE p.${P.status} = 1 AND (${clause})
    ORDER BY p.${P.totalSales} DESC
    LIMIT ${sqlLimit(limit)}
  `;
  const rows = await query(sql, params);
  return mapRows(rows, "product_fields", [TABLES.product]);
}

async function searchBySku(terms, limit) {
  const params = [];
  const clause = buildTermClause(
    [`s.${S.sku}`, `s.${S.name}`, `p.${P.name}`],
    terms,
    params
  );
  const sql = `
    SELECT DISTINCT ${PRODUCT_SELECT}, 'sku' AS match_source
    FROM ${TABLES.productSkus} s
    INNER JOIN ${TABLES.product} p ON p.${P.id} = s.${S.productId}
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE p.${P.status} = 1 AND (${clause})
    ORDER BY p.${P.totalSales} DESC
    LIMIT ${sqlLimit(limit)}
  `;
  const rows = await query(sql, params);
  return mapRows(rows, "sku", [TABLES.product, TABLES.productSkus]);
}

async function searchByCategory(terms, limit) {
  const params = [];
  const clause = buildTermClause(
    [`c.${C.name}`, `c.${C.fullUrl}`],
    terms,
    params
  );
  const sql = `
    SELECT ${PRODUCT_SELECT}, 'category' AS match_source
    FROM ${TABLES.product} p
    INNER JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE p.${P.status} = 1 AND (${clause})
    ORDER BY p.${P.totalSales} DESC
    LIMIT ${sqlLimit(limit)}
  `;
  const rows = await query(sql, params);
  return mapRows(rows, "category", [TABLES.product, TABLES.category]);
}

async function searchBySearchIndex(terms, limit) {
  const params = [];
  const clause = buildTermClause([`w.name`], terms, params);
  const sql = `
    SELECT DISTINCT ${PRODUCT_SELECT}, 'search_index' AS match_source
    FROM ${TABLES.searchWord} w
    INNER JOIN ${TABLES.searchIndex} si ON si.word_id = w.id
    INNER JOIN ${TABLES.product} p ON p.${P.id} = si.product_id
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE p.${P.status} = 1 AND (${clause})
    ORDER BY si.weight DESC, p.${P.totalSales} DESC
    LIMIT ${sqlLimit(limit)}
  `;
  const rows = await query(sql, params);
  return mapRows(rows, "search_index", [
    TABLES.product,
    TABLES.searchWord,
    TABLES.searchIndex,
  ]);
}

function mergeSearchHits(batches, maxProducts) {
  const byId = new Map();

  for (const batch of batches) {
    for (const row of batch) {
      const id = row.id;
      if (!id) continue;
      const tables = row._tables || [];
      const sources = row._matchSources || [];

      if (!byId.has(id)) {
        const {
          _tables,
          _matchSources,
          match_source: _matchSource,
          ...product
        } = row;
        byId.set(id, {
          ...product,
          _tables: new Set(tables),
          _matchSources: new Set(sources),
        });
      } else {
        const existing = byId.get(id);
        for (const t of tables) existing._tables.add(t);
        for (const s of sources) existing._matchSources.add(s);
      }
    }
  }

  const products = [...byId.values()].map((p) => ({
    ...p,
    shopDbTables: [...p._tables].sort(),
    shopMatchSources: [...p._matchSources],
  }));

  const tablesUsed = new Set();
  for (const p of products) {
    for (const t of p.shopDbTables) tablesUsed.add(t);
  }

  const cap = maxProducts > 0 ? maxProducts : products.length;
  return {
    products: cap > 0 ? products.slice(0, cap) : products,
    tablesUsed: [...tablesUsed].sort(),
  };
}

async function searchProductsExtended(terms, parsed, limit) {
  const perStrategy = sqlLimit(Math.max(limit, 10));
  const [byStructured, byProduct, bySku, byCategory, byIndex] =
    await Promise.all([
      searchByStructuredQuery(parsed, perStrategy),
      searchByProductFields(terms, perStrategy),
      searchBySku(terms, perStrategy),
      searchByCategory(terms, perStrategy),
      searchBySearchIndex(terms, perStrategy),
    ]);

  return mergeSearchHits(
    [byStructured, byProduct, bySku, byCategory, byIndex],
    0
  );
}

module.exports = {
  searchProductsExtended,
  mergeSearchHits,
  searchByStructuredQuery,
  searchByProductFields,
  searchBySku,
  searchByCategory,
  searchBySearchIndex,
};
