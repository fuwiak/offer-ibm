const mysql = require("mysql2/promise");
const {
  getCachedQuery,
  setCachedQuery,
  clearShopDbCache,
} = require("./cache");

let pool = null;

function resetPool() {
  if (pool) {
    pool.end().catch(() => {});
    pool = null;
  }
  clearShopDbCache();
}

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

function shopDbSslEnabled() {
  const flag = (process.env.SHOP_DB_SSL || process.env.DB_SSL || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on"].includes(flag);
}

function shopDbConnectTimeoutMs() {
  const n = parseInt(process.env.SHOP_DB_CONNECT_TIMEOUT_MS, 10);
  if (Number.isFinite(n) && n >= 3000) return Math.min(n, 120000);
  return 15000;
}

/**
 * Безопасные метаданные подключения (без пароля) — для логов Railway.
 */
function getShopDbTarget() {
  const url = buildDatabaseUrl();
  if (!url) {
    return {
      configured: false,
      host: null,
      port: null,
      database: null,
      user: null,
      ssl: shopDbSslEnabled(),
      connectTimeoutMs: shopDbConnectTimeoutMs(),
    };
  }
  try {
    const u = new URL(url);
    return {
      configured: true,
      host: u.hostname,
      port: u.port || "3306",
      database: u.pathname.replace(/^\//, "") || null,
      user: u.username || null,
      ssl: shopDbSslEnabled(),
      connectTimeoutMs: shopDbConnectTimeoutMs(),
    };
  } catch {
    return {
      configured: true,
      host: "(invalid DATABASE_URL)",
      port: null,
      database: null,
      user: null,
      ssl: shopDbSslEnabled(),
      connectTimeoutMs: shopDbConnectTimeoutMs(),
    };
  }
}

function getPoolOptions() {
  const uri = buildDatabaseUrl();
  const opts = {
    uri,
    waitForConnections: true,
    connectionLimit: 4,
    connectTimeout: shopDbConnectTimeoutMs(),
    charset: "utf8mb4",
  };
  if (shopDbSslEnabled()) {
    opts.ssl = { rejectUnauthorized: false };
  }
  return opts;
}

function getPool() {
  if (!isShopDbConfigured()) {
    throw new Error("SHOP_DB_NOT_CONFIGURED");
  }
  if (!pool) {
    const target = getShopDbTarget();
    pool = mysql.createPool(getPoolOptions());
    query("SELECT 1")
      .then(() => {
        require("../shopDbLog").ok("MySQL pool warmed", { target });
      })
      .catch((e) => {
        require("../shopDbLog").warn("MySQL pool warm failed", {
          error: e?.message || String(e),
          code: e?.code,
          target,
          hint: formatShopDbConnectionHint({
            target,
            error: e?.message,
            code: e?.code,
          }),
        });
      });
  }
  return pool;
}

async function query(sql, params = []) {
  const cached = getCachedQuery(sql, params);
  if (cached !== undefined) {
    return cached;
  }

  const p = getPool();
  const [rows] = await p.execute(sql, params);
  setCachedQuery(sql, params, rows);
  return rows;
}

/**
 * Текстовый запрос без prepared-statement (нужен для SHOW/DESCRIBE/EXPLAIN,
 * которые mysql2 не умеет через execute()). Возвращает { rows, fields }.
 */
async function rawQuery(sql, params = []) {
  const p = getPool();
  const [rows, fields] = await p.query(sql, params);
  return { rows, fields };
}

/**
 * Ping MySQL + счётчик активных товаров.
 * @returns {Promise<{ ok: boolean, activeProducts?: number, ms: number, target: object, error?: string, code?: string }>}
 */
async function pingShopDb() {
  const target = getShopDbTarget();
  const t0 = Date.now();
  if (!target.configured) {
    return {
      ok: false,
      ms: 0,
      target,
      error: "SHOP_DB_NOT_CONFIGURED",
    };
  }
  try {
    await query("SELECT 1 AS ok");
    const rows = await query(
      "SELECT COUNT(*) AS cnt FROM shop_product WHERE status = 1"
    );
    return {
      ok: true,
      activeProducts: rows[0]?.cnt ?? 0,
      ms: Date.now() - t0,
      target,
    };
  } catch (e) {
    return {
      ok: false,
      ms: Date.now() - t0,
      target,
      error: e.message,
      code: e.code,
    };
  }
}

function formatShopDbConnectionHint(pingResult) {
  const { target, error, code } = pingResult || {};
  const lines = [];
  if (target?.configured) {
    lines.push(
      `host=${target.host}:${target.port} db=${target.database} user=${target.user} ssl=${target.ssl}`
    );
  }
  if (code === "ETIMEDOUT" || /ETIMEDOUT/i.test(error || "")) {
    lines.push(
      "MySQL unreachable from this host (firewall / wrong DB_HOST / port blocked). " +
        "On Railway: set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (or DATABASE_URL) " +
        "and allow Railway egress IPs on the MySQL server."
    );
  }
  if (error) lines.push(`error=${error}`);
  return lines.join(" | ");
}

module.exports = {
  buildDatabaseUrl,
  isShopDbConfigured,
  getShopDbTarget,
  getPool,
  resetPool,
  query,
  rawQuery,
  pingShopDb,
  formatShopDbConnectionHint,
};
