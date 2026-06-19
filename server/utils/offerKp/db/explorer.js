/**
 * Read-only обозреватель ShopDB для админ-UI.
 *
 * Назначение: дать администратору возможность смотреть структуру каталога
 * purolat и выполнять SELECT-запросы из интерфейса, не подвергая БД риску
 * записи. Любые мутирующие запросы блокируются на уровне валидатора.
 */

const {
  getShopDbTarget,
  isShopDbConfigured,
  query,
  rawQuery,
} = require("./client");

const MAX_ROWS = 500;
const DEFAULT_ROWS = 100;

/** Запрещённые ключевые слова — всё, что может изменить данные/схему/окружение. */
const FORBIDDEN_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "create",
  "truncate",
  "replace",
  "rename",
  "grant",
  "revoke",
  "set",
  "call",
  "lock",
  "unlock",
  "merge",
  "handler",
  "load",
  "into\\s+outfile",
  "into\\s+dumpfile",
  "load_file",
  "sleep",
  "benchmark",
];

/** Разрешённые стартовые токены запроса. */
const ALLOWED_PREFIXES = ["select", "with", "show", "describe", "desc", "explain"];

function clampLimit(limit) {
  const n = parseInt(limit, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ROWS;
  return Math.min(n, MAX_ROWS);
}

/** Удаляет комментарии (-- ... , # ... , /* ... *\/) и нормализует пробелы. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/#[^\n]*/g, " ")
    .trim();
}

/**
 * Проверяет, что запрос безопасен для read-only выполнения.
 * @returns {{ ok: boolean, reason?: string, prefix?: string }}
 */
function validateReadOnlyQuery(rawSql) {
  if (typeof rawSql !== "string" || !rawSql.trim()) {
    return { ok: false, reason: "EMPTY_QUERY" };
  }

  let sql = stripComments(rawSql);
  // Убираем завершающую `;` (одиночный statement допустим).
  sql = sql.replace(/;\s*$/, "");

  if (!sql) return { ok: false, reason: "EMPTY_QUERY" };

  // Запрет нескольких выражений через `;`.
  if (sql.includes(";")) {
    return { ok: false, reason: "MULTIPLE_STATEMENTS" };
  }

  const lower = sql.toLowerCase();
  const prefix = ALLOWED_PREFIXES.find((p) =>
    new RegExp(`^${p}\\b`).test(lower)
  );
  if (!prefix) {
    return { ok: false, reason: "ONLY_SELECT_ALLOWED" };
  }

  for (const kw of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(lower)) {
      return { ok: false, reason: `FORBIDDEN_KEYWORD:${kw.replace(/\\s\+/g, " ")}` };
    }
  }

  return { ok: true, prefix, sql };
}

/** Добавляет LIMIT к простому SELECT/WITH, если его нет. */
function ensureLimit(sql, prefix, limit) {
  if (prefix !== "select" && prefix !== "with") return sql;
  if (/\blimit\b/i.test(sql)) return sql;
  return `${sql} LIMIT ${limit}`;
}

function assertConfigured() {
  if (!isShopDbConfigured()) {
    const err = new Error("SHOP_DB_NOT_CONFIGURED");
    err.code = "SHOP_DB_NOT_CONFIGURED";
    throw err;
  }
}

/** Статус подключения + безопасные метаданные цели. */
function dbStatus() {
  return {
    configured: isShopDbConfigured(),
    target: getShopDbTarget(),
    limits: { maxRows: MAX_ROWS, defaultRows: DEFAULT_ROWS },
  };
}

/** Список таблиц текущей БД с приблизительным числом строк. */
async function listTables() {
  assertConfigured();
  const { rows } = await rawQuery(
    `SELECT TABLE_NAME AS name, TABLE_ROWS AS approxRows, ENGINE AS engine
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME`
  );
  return rows.map((r) => ({
    name: r.name,
    approxRows: Number(r.approxRows ?? 0),
    engine: r.engine || null,
  }));
}

/** Описание колонок таблицы. */
async function describeTable(table) {
  assertConfigured();
  if (!/^[A-Za-z0-9_]+$/.test(String(table || ""))) {
    const err = new Error("INVALID_TABLE_NAME");
    err.code = "INVALID_TABLE_NAME";
    throw err;
  }
  const columns = await query(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
            COLUMN_KEY AS keyType, COLUMN_DEFAULT AS defaultValue, EXTRA AS extra
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [table]
  );
  if (!columns.length) {
    const err = new Error("TABLE_NOT_FOUND");
    err.code = "TABLE_NOT_FOUND";
    throw err;
  }
  return columns.map((c) => ({
    name: c.name,
    type: c.type,
    nullable: c.nullable === "YES",
    key: c.keyType || null,
    default: c.defaultValue,
    extra: c.extra || null,
  }));
}

/**
 * Выполняет проверенный read-only запрос.
 * @returns {Promise<{ columns: string[], rows: object[], rowCount: number, truncated: boolean, sql: string, ms: number }>}
 */
async function runReadQuery(rawSql, { limit } = {}) {
  assertConfigured();
  const verdict = validateReadOnlyQuery(rawSql);
  if (!verdict.ok) {
    const err = new Error(verdict.reason);
    err.code = "QUERY_REJECTED";
    err.reason = verdict.reason;
    throw err;
  }

  const cap = clampLimit(limit);
  const finalSql = ensureLimit(verdict.sql, verdict.prefix, cap);

  const t0 = Date.now();
  const { rows, fields } = await rawQuery(finalSql);
  const ms = Date.now() - t0;

  const list = Array.isArray(rows) ? rows : [];
  const truncated = list.length > cap;
  const limited = truncated ? list.slice(0, cap) : list;
  const columns =
    (fields && fields.map((f) => f.name)) ||
    (limited[0] ? Object.keys(limited[0]) : []);

  return {
    columns,
    rows: limited,
    rowCount: limited.length,
    truncated,
    sql: finalSql,
    ms,
  };
}

module.exports = {
  MAX_ROWS,
  DEFAULT_ROWS,
  validateReadOnlyQuery,
  dbStatus,
  listTables,
  describeTable,
  runReadQuery,
};
