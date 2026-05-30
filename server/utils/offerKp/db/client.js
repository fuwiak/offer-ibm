const mysql = require("mysql2/promise");

let pool = null;

function buildDatabaseUrl() {
  if ((process.env.DATABASE_URL || "").trim()) {
    return process.env.DATABASE_URL.trim();
  }
  const host = (process.env.DB_HOST || "").trim();
  if (!host) return null;
  const port = process.env.DB_PORT || "3306";
  const user = encodeURIComponent(process.env.DB_USER || "");
  const password = encodeURIComponent(process.env.DB_PASSWORD || "");
  const database = process.env.DB_NAME || "";
  return `mysql://${user}:${password}@${host}:${port}/${database}`;
}

function isShopDbConfigured() {
  const url = buildDatabaseUrl();
  return !!(url && /^mysql:/i.test(url));
}

function getPool() {
  if (!isShopDbConfigured()) {
    throw new Error("SHOP_DB_NOT_CONFIGURED");
  }
  if (!pool) {
    pool = mysql.createPool({
      uri: buildDatabaseUrl(),
      waitForConnections: true,
      connectionLimit: 4,
      connectTimeout: 15000,
      charset: "utf8mb4",
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

module.exports = {
  buildDatabaseUrl,
  isShopDbConfigured,
  getPool,
  query,
};
