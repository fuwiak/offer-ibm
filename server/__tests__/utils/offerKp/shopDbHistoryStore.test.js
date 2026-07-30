const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  ShopDbHistoryStore,
} = require("../../../utils/offerKp/shopDbHistoryStore");

describe("ShopDB history SQLite", () => {
  let directory;
  let store;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "shopdb-history-"));
    store = new ShopDbHistoryStore({
      databaseFile: path.join(directory, "history.sqlite"),
    });
  });

  afterEach(async () => {
    await store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("stores sync runs, canonical versions and embedding events separately", async () => {
    const syncId = await store.startSync({
      modelId: "e5",
      indexVersion: 4,
    });
    const records = [
      {
        productId: 101,
        hash: "a".repeat(64),
        canonicalText: "тип=болт",
        signature: { productType: "болт" },
      },
    ];
    await store.recordProductVersions(records, "e5");
    await store.recordEmbeddingBatch(syncId, records, "e5", "embedded");
    await store.completeSync(syncId, {
      productCount: 1,
      embeddedCount: 1,
    });

    await expect(store.stats()).resolves.toEqual({
      runs: 1,
      productVersions: 1,
      embeddingEvents: 1,
    });
    expect(fs.existsSync(path.join(directory, "history.sqlite"))).toBe(true);
  });

  it("updates last_seen instead of duplicating the same product version", async () => {
    const record = {
      productId: 101,
      hash: "a".repeat(64),
      canonicalText: "тип=болт",
    };
    await store.recordProductVersions([record], "e5");
    await store.recordProductVersions([record], "e5");
    expect((await store.stats()).productVersions).toBe(1);
  });
});
