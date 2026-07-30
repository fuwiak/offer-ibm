"use strict";

const path = require("path");
const crypto = require("crypto");
const lancedb = require("@lancedb/lancedb");

const DEFAULT_VECTOR_DB_DIR = process.env.SHOP_DB_VECTOR_DB_DIR
  ? path.resolve(process.env.SHOP_DB_VECTOR_DB_DIR)
  : process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR, "shopdb-vector-db")
    : path.resolve(__dirname, "../../storage/shopdb-vector-db");

function tableNameForModel(modelId) {
  const suffix = crypto
    .createHash("sha256")
    .update(String(modelId || ""), "utf8")
    .digest("hex")
    .slice(0, 16);
  return `shopdb_catalog_${suffix}`;
}

class ShopDbVectorStore {
  constructor({ directory = DEFAULT_VECTOR_DB_DIR, modelId } = {}) {
    this.directory = path.resolve(directory);
    this.modelId = String(modelId || "");
    this.tableName = tableNameForModel(this.modelId);
    this.connection = null;
    this.table = null;
  }

  async connect() {
    if (!this.connection) {
      this.connection = await lancedb.connect(this.directory);
    }
    return this.connection;
  }

  async openTable() {
    if (this.table) return this.table;
    const connection = await this.connect();
    const names = await connection.tableNames();
    if (!names.includes(this.tableName)) return null;
    this.table = await connection.openTable(this.tableName);
    return this.table;
  }

  async upsert(rows) {
    if (!Array.isArray(rows) || !rows.length) return 0;
    const data = rows.map((row) => ({
      product_id: Number(row.productId),
      hash: String(row.hash),
      model_id: this.modelId,
      canonical_text: String(row.canonicalText || ""),
      vector:
        row.vector instanceof Float32Array
          ? Array.from(row.vector)
          : row.vector.map(Number),
      updated_at: new Date().toISOString(),
    }));
    const connection = await this.connect();
    let table = await this.openTable();
    if (!table) {
      table = await connection.createTable(this.tableName, data);
      this.table = table;
    } else {
      await table
        .mergeInsert("product_id")
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute(data);
    }
    return data.length;
  }

  async metadata({ includeVectors = false } = {}) {
    const table = await this.openTable();
    if (!table) return [];
    const columns = includeVectors
      ? ["product_id", "hash", "vector"]
      : ["product_id", "hash"];
    const rows = await table.query().select(columns).toArray();
    return rows.map((row) => ({
      productId: Number(row.product_id),
      hash: row.hash,
      ...(includeVectors ? { vector: row.vector } : {}),
    }));
  }

  async search(queryVector, topK = 50) {
    const table = await this.openTable();
    if (!table || !queryVector?.length) return [];
    const rows = await table
      .vectorSearch(queryVector)
      .distanceType("cosine")
      .limit(Math.max(1, Math.min(200, Number(topK) || 50)))
      .toArray();
    return rows.map((row) => ({
      productId: Number(row.product_id),
      hash: row.hash,
      score: Math.max(0, Math.min(1, 1 - Number(row._distance || 0))),
    }));
  }

  async count() {
    const table = await this.openTable();
    return table ? table.countRows() : 0;
  }

  async removeMissing(activeProductIds) {
    const table = await this.openTable();
    if (!table) return 0;
    const active = new Set((activeProductIds || []).map(Number));
    const rows = await table.query().select(["product_id"]).toArray();
    const stale = rows
      .map((row) => Number(row.product_id))
      .filter((productId) => !active.has(productId));
    for (let offset = 0; offset < stale.length; offset += 200) {
      const ids = stale.slice(offset, offset + 200);
      await table.delete(`product_id IN (${ids.join(",")})`);
    }
    return stale.length;
  }

  async optimize() {
    const table = await this.openTable();
    if (table && typeof table.optimize === "function") {
      await table.optimize();
    }
  }
}

const stores = new Map();

function getShopDbVectorStore(modelId) {
  const key = String(modelId || "");
  if (!stores.has(key)) {
    stores.set(key, new ShopDbVectorStore({ modelId: key }));
  }
  return stores.get(key);
}

module.exports = {
  DEFAULT_VECTOR_DB_DIR,
  tableNameForModel,
  ShopDbVectorStore,
  getShopDbVectorStore,
};
