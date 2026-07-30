const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const {
  loadVectorCheckpoint,
  appendVectorCheckpoint,
  clearVectorCheckpoint,
  acquireIndexSyncLock,
} = require("../../../utils/offerKp/canonicalVectorCheckpoint");

describe("canonical vector checkpoint", () => {
  let directory;

  beforeEach(() => {
    directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "shopdb-vector-checkpoint-")
    );
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function row(productId, text, vector) {
    return {
      productId,
      hash: crypto.createHash("sha256").update(text).digest("hex"),
      vector,
    };
  }

  it("persists completed batches and resumes them by product hash", () => {
    appendVectorCheckpoint(directory, "e5", [
      row(101, "bolt", [1, 0, 0]),
      row(102, "nut", [0, 1, 0]),
    ]);
    appendVectorCheckpoint(directory, "e5", [row(103, "washer", [0, 0, 1])]);

    const checkpoint = loadVectorCheckpoint(directory, "e5");
    expect(checkpoint.meta).toMatchObject({ dims: 3, count: 3 });
    expect([...checkpoint.byId.keys()]).toEqual([101, 102, 103]);
    expect([...checkpoint.byId.get(102).vector]).toEqual([0, 1, 0]);
  });

  it("ignores a checkpoint created by another embedding model", () => {
    appendVectorCheckpoint(directory, "e5-a", [row(101, "bolt", [1, 0])]);
    expect(loadVectorCheckpoint(directory, "e5-b")).toBeNull();
  });

  it("prevents two live processes from owning the same sync", () => {
    const release = acquireIndexSyncLock(directory);
    expect(typeof release).toBe("function");
    expect(acquireIndexSyncLock(directory)).toBeNull();
    release();
    const reacquired = acquireIndexSyncLock(directory);
    expect(typeof reacquired).toBe("function");
    reacquired();
  });

  it("removes checkpoint data after the final matrix is committed", () => {
    appendVectorCheckpoint(directory, "e5", [row(101, "bolt", [1, 0])]);
    clearVectorCheckpoint(directory);
    expect(loadVectorCheckpoint(directory, "e5")).toBeNull();
  });
});
