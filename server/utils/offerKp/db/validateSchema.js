const { query } = require("./client");
const { SCHEMA_REQUIREMENTS, TABLES } = require("./schema");

/**
 * Проверяет наличие таблиц и колонок, нужных enrich (цена, SKU, характеристики, поиск).
 * @returns {Promise<{ ok: boolean, missingTables: string[], missingColumns: Record<string, string[]>, tablesChecked: string[] }>}
 */
async function validateShopDbSchema() {
  const tableNames = Object.keys(SCHEMA_REQUIREMENTS);
  const placeholders = tableNames.map(() => "?").join(",");
  const tableRows = await query(
    `SELECT TABLE_NAME AS name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (${placeholders})`,
    tableNames
  );
  const existingTables = new Set(tableRows.map((r) => r.name));
  const missingTables = tableNames.filter((t) => !existingTables.has(t));

  const missingColumns = {};
  for (const table of tableNames) {
    if (!existingTables.has(table)) continue;
    const required = SCHEMA_REQUIREMENTS[table];
    const colRows = await query(
      `SELECT COLUMN_NAME AS name
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?`,
      [table]
    );
    const existingCols = new Set(colRows.map((r) => r.name));
    const missing = required.filter((c) => !existingCols.has(c));
    if (missing.length) missingColumns[table] = missing;
  }

  const missingColumnCount = Object.values(missingColumns).reduce(
    (n, arr) => n + arr.length,
    0
  );

  return {
    ok: missingTables.length === 0 && missingColumnCount === 0,
    missingTables,
    missingColumns,
    tablesChecked: [...existingTables].sort(),
  };
}

/**
 * Одна строка каталога с ценой — smoke для SQL enrich.
 */
async function fetchSamplePricedProduct() {
  const rows = await query(
    `SELECT p.id, p.name, p.price, p.currency
     FROM ${TABLES.product} p
     WHERE p.status = 1 AND p.price > 0
     ORDER BY p.total_sales DESC
     LIMIT 1`
  );
  return rows[0] || null;
}

module.exports = {
  validateShopDbSchema,
  fetchSamplePricedProduct,
};
