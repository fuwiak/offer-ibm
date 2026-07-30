"use strict";

const fs = require("fs");
const path = require("path");

const CHECKPOINT_VERSION = 1;
const CHECKPOINT_DATA_FILE = "canonical-vectors.checkpoint.bin";
const CHECKPOINT_META_FILE = "canonical-vectors.checkpoint.json";
const SYNC_LOCK_FILE = "canonical-index-sync.lock";
const ID_BYTES = 4;
const HASH_BYTES = 32;

function checkpointPaths(directory) {
  return {
    data: path.join(directory, CHECKPOINT_DATA_FILE),
    meta: path.join(directory, CHECKPOINT_META_FILE),
    lock: path.join(directory, SYNC_LOCK_FILE),
  };
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeAtomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), "utf8");
  fs.renameSync(temporary, file);
}

function recordBytes(dims) {
  return ID_BYTES + HASH_BYTES + dims * Float32Array.BYTES_PER_ELEMENT;
}

function clearVectorCheckpoint(directory) {
  const files = checkpointPaths(directory);
  for (const file of [files.data, files.meta]) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      // A stale checkpoint is harmless; the next validated load will ignore it.
    }
  }
}

function loadVectorCheckpoint(directory, modelId) {
  const files = checkpointPaths(directory);
  const meta = readJson(files.meta, null);
  if (
    !meta ||
    meta.version !== CHECKPOINT_VERSION ||
    meta.modelId !== modelId ||
    !Number.isInteger(meta.dims) ||
    meta.dims <= 0 ||
    !Number.isInteger(meta.count) ||
    meta.count < 0 ||
    !fs.existsSync(files.data)
  ) {
    return null;
  }

  const bytesPerRecord = recordBytes(meta.dims);
  const expectedBytes = meta.count * bytesPerRecord;
  const buffer = fs.readFileSync(files.data);
  if (buffer.length < expectedBytes) return null;

  const byId = new Map();
  for (let index = 0; index < meta.count; index += 1) {
    const offset = index * bytesPerRecord;
    const productId = buffer.readUInt32LE(offset);
    const hash = buffer
      .subarray(offset + ID_BYTES, offset + ID_BYTES + HASH_BYTES)
      .toString("hex");
    const vector = new Float32Array(meta.dims);
    const vectorOffset = offset + ID_BYTES + HASH_BYTES;
    for (let dim = 0; dim < meta.dims; dim += 1) {
      vector[dim] = buffer.readFloatLE(
        vectorOffset + dim * Float32Array.BYTES_PER_ELEMENT
      );
    }
    byId.set(productId, { hash, vector });
  }

  return { meta, byId };
}

function appendVectorCheckpoint(directory, modelId, rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const dims = Number(rows[0]?.vector?.length) || 0;
  if (!dims) throw new Error("Cannot checkpoint empty embedding vectors.");
  if (rows.some((row) => row?.vector?.length !== dims)) {
    throw new Error(
      "Cannot checkpoint embedding vectors with mixed dimensions."
    );
  }

  fs.mkdirSync(directory, { recursive: true });
  const files = checkpointPaths(directory);
  let checkpoint = loadVectorCheckpoint(directory, modelId);
  if (checkpoint && checkpoint.meta.dims !== dims) {
    clearVectorCheckpoint(directory);
    checkpoint = null;
  }

  const count = checkpoint?.meta.count || 0;
  const bytesPerRecord = recordBytes(dims);
  const committedBytes = count * bytesPerRecord;
  if (!fs.existsSync(files.data)) fs.writeFileSync(files.data, Buffer.alloc(0));
  fs.truncateSync(files.data, committedBytes);

  const payload = Buffer.allocUnsafe(rows.length * bytesPerRecord);
  rows.forEach((row, index) => {
    const offset = index * bytesPerRecord;
    const productId = Number(row.productId);
    const hash = String(row.hash || "");
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new Error(`Invalid checkpoint product id: ${row.productId}`);
    }
    if (!/^[a-f0-9]{64}$/i.test(hash)) {
      throw new Error(`Invalid checkpoint hash for product ${productId}`);
    }

    payload.writeUInt32LE(productId, offset);
    Buffer.from(hash, "hex").copy(payload, offset + ID_BYTES);
    const vectorOffset = offset + ID_BYTES + HASH_BYTES;
    for (let dim = 0; dim < dims; dim += 1) {
      payload.writeFloatLE(
        Number(row.vector[dim]) || 0,
        vectorOffset + dim * Float32Array.BYTES_PER_ELEMENT
      );
    }
  });

  fs.appendFileSync(files.data, payload);
  const meta = {
    version: CHECKPOINT_VERSION,
    modelId,
    dims,
    count: count + rows.length,
    updatedAt: new Date().toISOString(),
  };
  writeAtomicJson(files.meta, meta);
  return meta;
}

function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

/**
 * Cross-process lock. Returns a release function or null when another live
 * process is already synchronizing the same persistent index.
 */
function acquireIndexSyncLock(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const lockFile = checkpointPaths(directory).lock;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = fs.openSync(lockFile, "wx");
      fs.writeFileSync(
        handle,
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
        })
      );
      fs.closeSync(handle);
      return () => {
        const owner = readJson(lockFile, null);
        if (Number(owner?.pid) === process.pid && fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = readJson(lockFile, null);
      if (pidIsAlive(Number(owner?.pid))) return null;
      try {
        fs.unlinkSync(lockFile);
      } catch {
        return null;
      }
    }
  }
  return null;
}

module.exports = {
  CHECKPOINT_VERSION,
  CHECKPOINT_DATA_FILE,
  CHECKPOINT_META_FILE,
  SYNC_LOCK_FILE,
  checkpointPaths,
  loadVectorCheckpoint,
  appendVectorCheckpoint,
  clearVectorCheckpoint,
  acquireIndexSyncLock,
};
