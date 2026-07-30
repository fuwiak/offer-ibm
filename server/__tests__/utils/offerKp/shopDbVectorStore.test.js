const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  ShopDbVectorStore,
  tableNameForModel,
} = require("../../../utils/offerKp/shopDbVectorStore");

describe("ShopDB LanceDB vector store", () => {
  let directory;
  let store;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "shopdb-lancedb-"));
    store = new ShopDbVectorStore({ directory, modelId: "e5-test" });
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("uses a stable model-specific table name", () => {
    expect(tableNameForModel("e5-test")).toMatch(
      /^shopdb_catalog_[a-f0-9]{16}$/
    );
    expect(tableNameForModel("e5-test")).toBe(tableNameForModel("e5-test"));
    expect(tableNameForModel("e5-test")).not.toBe(tableNameForModel("other"));
  });

  it("upserts vectors by product and searches with cosine distance", async () => {
    await store.upsert([
      {
        productId: 101,
        hash: "a".repeat(64),
        canonicalText: "тип=болт",
        vector: [1, 0, 0],
      },
      {
        productId: 102,
        hash: "b".repeat(64),
        canonicalText: "тип=гайка",
        vector: [0, 1, 0],
      },
    ]);
    await store.upsert([
      {
        productId: 101,
        hash: "c".repeat(64),
        canonicalText: "тип=болт | покрытие=цинк",
        vector: [0.9, 0.1, 0],
      },
    ]);

    expect(await store.count()).toBe(2);
    const metadata = await store.metadata();
    expect(metadata.find((row) => Number(row.productId) === 101)?.hash).toBe(
      "c".repeat(64)
    );
    const hits = await store.search([1, 0, 0], 1);
    expect(hits[0].productId).toBe(101);
    expect(hits[0].score).toBeGreaterThan(0.98);
  });

  it("removes products no longer active in ShopDB", async () => {
    await store.upsert([
      {
        productId: 101,
        hash: "a".repeat(64),
        canonicalText: "a",
        vector: [1, 0],
      },
      {
        productId: 102,
        hash: "b".repeat(64),
        canonicalText: "b",
        vector: [0, 1],
      },
    ]);
    await expect(store.removeMissing([101])).resolves.toBe(1);
    expect(await store.count()).toBe(1);
  });
});
