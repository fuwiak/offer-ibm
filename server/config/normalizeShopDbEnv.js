const fs = require("fs");
const path = require("path");

/** Известная опечатка в Railway / server/.env — MySQL на purolat.com слушает 3306. */
const KNOWN_WRONG_PORTS = new Set(["1500"]);
const DEFAULT_MYSQL_PORT = "3306";

function envIsSet(key) {
  const v = process.env[key];
  return v != null && String(v).trim() !== "";
}

function parseDatabaseUrlPort(url) {
  try {
    const u = new URL(url);
    return u.port || DEFAULT_MYSQL_PORT;
  } catch {
    const m = String(url).match(/:(\d+)(?:\/|$)/);
    return m ? m[1] : null;
  }
}

function fixPortInDatabaseUrl(url, newPort) {
  try {
    const u = new URL(url);
    u.port = newPort;
    return u.toString();
  } catch {
    return String(url).replace(/:1500(\/|$)/, `:${newPort}$1`);
  }
}

function rebuildDatabaseUrlFromParts() {
  const host = (process.env.DB_HOST || "").trim();
  if (!host) return null;
  const port = (process.env.DB_PORT || DEFAULT_MYSQL_PORT).trim();
  const user = encodeURIComponent(process.env.DB_USER || "");
  const password = encodeURIComponent(process.env.DB_PASSWORD || "");
  const database = (process.env.DB_NAME || "").trim();
  if (!database) return null;
  return `mysql://${user}:${password}@${host}:${port}/${database}`;
}

function resetShopDbPool() {
  try {
    const client = require("../utils/offerKp/db/client");
    if (typeof client.resetPool === "function") client.resetPool();
  } catch {
    /* pool not loaded yet */
  }
}

/**
 * Исправляет legacy-порт 1500 и синхронизирует DATABASE_URL с DB_PORT.
 * Вызывается из loadEnv до первого подключения к MySQL.
 */
function normalizeShopDbEnv({ log = true } = {}) {
  const fixes = [];

  const dbPort = (process.env.DB_PORT || "").trim();
  if (KNOWN_WRONG_PORTS.has(dbPort)) {
    process.env.DB_PORT = DEFAULT_MYSQL_PORT;
    fixes.push(`DB_PORT ${dbPort}→${DEFAULT_MYSQL_PORT}`);
  }

  const dbUrl = (process.env.DATABASE_URL || "").trim();
  if (dbUrl) {
    const urlPort = parseDatabaseUrlPort(dbUrl);
    if (urlPort && KNOWN_WRONG_PORTS.has(urlPort)) {
      process.env.DATABASE_URL = fixPortInDatabaseUrl(
        dbUrl,
        DEFAULT_MYSQL_PORT
      );
      fixes.push(`DATABASE_URL port ${urlPort}→${DEFAULT_MYSQL_PORT}`);
    }
  }

  const envPort = (process.env.DB_PORT || DEFAULT_MYSQL_PORT).trim();
  const currentUrl = (process.env.DATABASE_URL || "").trim();
  if (currentUrl && envPort) {
    const urlPort = parseDatabaseUrlPort(currentUrl);
    if (urlPort && urlPort !== envPort) {
      process.env.DATABASE_URL = fixPortInDatabaseUrl(currentUrl, envPort);
      fixes.push(`DATABASE_URL port ${urlPort}→${envPort} (sync DB_PORT)`);
    }
  }

  if (!currentUrl && envIsSet("DB_HOST") && envIsSet("DB_NAME")) {
    const rebuilt = rebuildDatabaseUrlFromParts();
    if (rebuilt) {
      process.env.DATABASE_URL = rebuilt;
      fixes.push("DATABASE_URL rebuilt from DB_*");
    }
  }

  if (fixes.length) {
    resetShopDbPool();
    if (log) {
      const shopDbLog = require("../utils/offerKp/shopDbLog");
      const { getShopDbTarget } = require("../utils/offerKp/db/client");
      shopDbLog.warn("Shop DB env normalized", {
        fixes,
        target: getShopDbTarget(),
        hint: "Port 1500 is unreachable; MySQL on purolat.com uses 3306",
      });
    }
  }

  return fixes;
}

function syncShopDbEnvFile(envPath = path.resolve(__dirname, "../.env")) {
  if (!fs.existsSync(envPath)) return [];

  const before = fs.readFileSync(envPath, "utf8");
  normalizeShopDbEnv({ log: false });

  let content = before;
  const written = [];

  if (envIsSet("DB_PORT")) {
    const line = `DB_PORT="${process.env.DB_PORT.trim()}"`;
    const re = /^DB_PORT=.*$/m;
    if (re.test(content)) {
      if (!content.match(re)[0].includes(process.env.DB_PORT.trim())) {
        content = content.replace(re, line);
        written.push("DB_PORT");
      }
    }
  }

  if (envIsSet("DATABASE_URL")) {
    const url = process.env.DATABASE_URL.trim();
    const line = `DATABASE_URL="${url}"`;
    const re = /^DATABASE_URL=.*$/m;
    if (re.test(content)) {
      const current = content.match(re)[0];
      if (!current.includes(`:${process.env.DB_PORT || DEFAULT_MYSQL_PORT}/`)) {
        content = content.replace(re, line);
        written.push("DATABASE_URL");
      }
    }
  }

  if (content !== before) {
    fs.writeFileSync(envPath, content);
  }

  return written;
}

module.exports = {
  normalizeShopDbEnv,
  syncShopDbEnvFile,
  KNOWN_WRONG_PORTS,
  DEFAULT_MYSQL_PORT,
  parseDatabaseUrlPort,
  fixPortInDatabaseUrl,
};
