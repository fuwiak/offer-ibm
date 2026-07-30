"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const DEFAULT_HISTORY_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR, "shopdb-history")
  : path.resolve(__dirname, "../../storage/shopdb-history");
const DEFAULT_HISTORY_DB = process.env.SHOP_DB_HISTORY_DB
  ? path.resolve(process.env.SHOP_DB_HISTORY_DB)
  : path.join(DEFAULT_HISTORY_DIR, "history.sqlite");

class ShopDbHistoryStore {
  constructor({ databaseFile = DEFAULT_HISTORY_DB } = {}) {
    this.databaseFile = path.resolve(databaseFile);
    this.client = null;
    this.ready = null;
  }

  async initialize() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      fs.mkdirSync(path.dirname(this.databaseFile), { recursive: true });
      this.client = new PrismaClient({
        datasources: { db: { url: `file:${this.databaseFile}` } },
        log: ["error"],
      });
      await this.client.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
      await this.client.$queryRawUnsafe("PRAGMA synchronous=NORMAL;");
      await this.client.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
      await this.client.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS catalog_sync_runs (
          id TEXT PRIMARY KEY,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          status TEXT NOT NULL,
          model_id TEXT NOT NULL,
          index_version INTEGER NOT NULL,
          product_count INTEGER NOT NULL DEFAULT 0,
          embedded_count INTEGER NOT NULL DEFAULT 0,
          reused_count INTEGER NOT NULL DEFAULT 0,
          error TEXT
        )
      `);
      await this.client.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS product_versions (
          product_id INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          canonical_text TEXT NOT NULL,
          signature_json TEXT,
          embedding_model TEXT NOT NULL,
          first_seen_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          PRIMARY KEY (product_id, content_hash, embedding_model)
        )
      `);
      await this.client.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS embedding_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sync_id TEXT NOT NULL,
          product_id INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          model_id TEXT NOT NULL,
          action TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      await this.client.$executeRawUnsafe(
        "CREATE INDEX IF NOT EXISTS idx_embedding_events_sync ON embedding_events(sync_id)"
      );
      await this.client.$executeRawUnsafe(
        "CREATE INDEX IF NOT EXISTS idx_product_versions_hash ON product_versions(content_hash)"
      );
      await this.client.$executeRawUnsafe(
        `UPDATE catalog_sync_runs
         SET completed_at=?, status='interrupted',
             error=COALESCE(error, 'process restarted before completion')
         WHERE status='running'`,
        new Date().toISOString()
      );
      return this;
    })();
    return this.ready;
  }

  async startSync({ modelId, indexVersion }) {
    await this.initialize();
    const id = crypto.randomUUID();
    await this.client.$executeRawUnsafe(
      `INSERT INTO catalog_sync_runs
       (id, started_at, status, model_id, index_version)
       VALUES (?, ?, 'running', ?, ?)`,
      id,
      new Date().toISOString(),
      modelId,
      Number(indexVersion)
    );
    return id;
  }

  async recordProductVersions(records, modelId) {
    await this.initialize();
    const now = new Date().toISOString();
    const batchSize = 80;
    for (let offset = 0; offset < records.length; offset += batchSize) {
      const batch = records.slice(offset, offset + batchSize);
      const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(",");
      const values = batch.flatMap((record) => [
        Number(record.productId),
        record.hash,
        record.canonicalText,
        record.signature ? JSON.stringify(record.signature) : null,
        modelId,
        now,
        now,
      ]);
      await this.client.$executeRawUnsafe(
        `INSERT INTO product_versions
         (product_id, content_hash, canonical_text, signature_json,
          embedding_model, first_seen_at, last_seen_at)
         VALUES ${placeholders}
         ON CONFLICT(product_id, content_hash, embedding_model)
         DO UPDATE SET last_seen_at=excluded.last_seen_at`,
        ...values
      );
    }
  }

  async recordEmbeddingBatch(syncId, rows, modelId, action = "embedded") {
    if (!rows?.length) return;
    await this.initialize();
    const now = new Date().toISOString();
    const placeholders = rows.map(() => "(?, ?, ?, ?, ?, ?)").join(",");
    const values = rows.flatMap((row) => [
      syncId,
      Number(row.productId),
      row.hash,
      modelId,
      action,
      now,
    ]);
    await this.client.$executeRawUnsafe(
      `INSERT INTO embedding_events
       (sync_id, product_id, content_hash, model_id, action, created_at)
       VALUES ${placeholders}`,
      ...values
    );
  }

  async completeSync(
    syncId,
    { productCount = 0, embeddedCount = 0, reusedCount = 0 } = {}
  ) {
    await this.initialize();
    await this.client.$executeRawUnsafe(
      `UPDATE catalog_sync_runs
       SET completed_at=?, status='completed', product_count=?,
           embedded_count=?, reused_count=?
       WHERE id=?`,
      new Date().toISOString(),
      Number(productCount),
      Number(embeddedCount),
      Number(reusedCount),
      syncId
    );
  }

  async failSync(syncId, error) {
    if (!syncId) return;
    await this.initialize();
    await this.client.$executeRawUnsafe(
      `UPDATE catalog_sync_runs
       SET completed_at=?, status='failed', error=?
       WHERE id=?`,
      new Date().toISOString(),
      String(error?.message || error || "unknown").slice(0, 2000),
      syncId
    );
  }

  async stats() {
    await this.initialize();
    const [runs, versions, events] = await Promise.all([
      this.client.$queryRawUnsafe(
        "SELECT COUNT(*) AS count FROM catalog_sync_runs"
      ),
      this.client.$queryRawUnsafe(
        "SELECT COUNT(*) AS count FROM product_versions"
      ),
      this.client.$queryRawUnsafe(
        "SELECT COUNT(*) AS count FROM embedding_events"
      ),
    ]);
    return {
      runs: Number(runs[0]?.count || 0),
      productVersions: Number(versions[0]?.count || 0),
      embeddingEvents: Number(events[0]?.count || 0),
    };
  }

  async close() {
    if (this.client) await this.client.$disconnect();
    this.client = null;
    this.ready = null;
  }
}

let singleton = null;

function getShopDbHistoryStore() {
  if (!singleton) singleton = new ShopDbHistoryStore();
  return singleton;
}

module.exports = {
  DEFAULT_HISTORY_DIR,
  DEFAULT_HISTORY_DB,
  ShopDbHistoryStore,
  getShopDbHistoryStore,
};
