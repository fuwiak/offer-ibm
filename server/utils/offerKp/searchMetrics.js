"use strict";

/**
 * Непрерывный, лёгкий сбор метрик качества ShopDB-matching. Fire-and-forget
 * дозапись JSON-строки в локальный файл на каждый matchInquiryLine — без
 * изменений схемы БД, без сети, без модели. Это "триггер", который наполняет
 * непрерывный мониторинг retrieval, а не разовый снимок (в отличие от
 * scripts/measure-shopdb-search-quality.cjs, который меряет только golden set).
 *
 * Агрегируется scripts/report-shopdb-metrics.cjs, выводится в `offerkp metrics`
 * (cli/metrics.go) — см. AUDYT.md §9.
 */

const fs = require("fs");
const path = require("path");

function envFlagEnabled(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return !["0", "false", "no", "off"].includes(
    String(raw).trim().toLowerCase()
  );
}

const METRICS_ENABLED = envFlagEnabled("SHOP_DB_METRICS_ENABLED", true);

const METRICS_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR, "metrics")
  : path.resolve(__dirname, "../../storage/metrics");
const METRICS_FILE = path.join(METRICS_DIR, "shopdb-search.jsonl");

// Simple size-based rotation (one backup) — this is an operational metrics
// stream, not an audit log; unbounded growth is the only real risk here.
const MAX_FILE_BYTES = Math.max(
  1_000_000,
  parseInt(process.env.SHOP_DB_METRICS_MAX_BYTES, 10) || 20_000_000
);

let dirEnsured = false;
function ensureDir() {
  if (dirEnsured) return;
  try {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  } catch {
    /* best-effort */
  }
  dirEnsured = true;
}

function rotateIfNeeded() {
  try {
    const stat = fs.statSync(METRICS_FILE);
    if (stat.size > MAX_FILE_BYTES) {
      const backup = `${METRICS_FILE}.1`;
      fs.rmSync(backup, { force: true });
      fs.renameSync(METRICS_FILE, backup);
    }
  } catch {
    /* file doesn't exist yet on first run — nothing to rotate */
  }
}

/**
 * @param {{
 *   matchType: string,
 *   source?: string,
 *   strategies?: string[],
 *   hasPrice: boolean,
 *   candidateCount: number,
 *   queryLen: number,
 *   threadId?: string|null,
 * }} event
 */
function recordSearchMetric(event) {
  if (!METRICS_ENABLED) return;
  try {
    ensureDir();
    rotateIfNeeded();
    const record = { ts: new Date().toISOString(), ...event };
    // Fire-and-forget: matching must never wait on or fail because of this.
    fs.appendFile(METRICS_FILE, `${JSON.stringify(record)}\n`, (err) => {
      if (err) {
        console.error("[SearchMetrics] Append failed:", err?.message || err);
      }
    });
  } catch (error) {
    console.error(
      "[SearchMetrics] Failed to record, continuing without metrics:",
      error?.message || error
    );
  }
}

module.exports = {
  recordSearchMetric,
  isMetricsEnabled: () => METRICS_ENABLED,
  METRICS_FILE,
};
