"use strict";

const {
  optimizeVectorStoreOnSync,
} = require("../../../utils/offerKp/canonicalCatalogIndex");

describe("canonical catalog index maintenance", () => {
  const original = process.env.SHOP_DB_VECTOR_OPTIMIZE_ON_SYNC;

  afterEach(() => {
    if (original == null) {
      delete process.env.SHOP_DB_VECTOR_OPTIMIZE_ON_SYNC;
    } else {
      process.env.SHOP_DB_VECTOR_OPTIMIZE_ON_SYNC = original;
    }
  });

  it("does not block readiness on LanceDB compaction by default", () => {
    delete process.env.SHOP_DB_VECTOR_OPTIMIZE_ON_SYNC;
    expect(optimizeVectorStoreOnSync()).toBe(false);
  });

  it("allows explicit maintenance compaction", () => {
    process.env.SHOP_DB_VECTOR_OPTIMIZE_ON_SYNC = "1";
    expect(optimizeVectorStoreOnSync()).toBe(true);
  });
});
