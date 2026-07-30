"use strict";

const {
  optimizeVectorStoreOnSync,
  verifyVectorHashesOnSync,
} = require("../../../utils/offerKp/canonicalCatalogIndex");

describe("canonical catalog index maintenance", () => {
  const original = process.env.SHOP_DB_VECTOR_OPTIMIZE_ON_SYNC;
  const originalVerify = process.env.SHOP_DB_VECTOR_VERIFY_HASHES_ON_SYNC;

  afterEach(() => {
    if (original == null) {
      delete process.env.SHOP_DB_VECTOR_OPTIMIZE_ON_SYNC;
    } else {
      process.env.SHOP_DB_VECTOR_OPTIMIZE_ON_SYNC = original;
    }
    if (originalVerify == null) {
      delete process.env.SHOP_DB_VECTOR_VERIFY_HASHES_ON_SYNC;
    } else {
      process.env.SHOP_DB_VECTOR_VERIFY_HASHES_ON_SYNC = originalVerify;
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

  it("only scans all LanceDB hashes in explicit audit mode", () => {
    delete process.env.SHOP_DB_VECTOR_VERIFY_HASHES_ON_SYNC;
    expect(verifyVectorHashesOnSync()).toBe(false);
    process.env.SHOP_DB_VECTOR_VERIFY_HASHES_ON_SYNC = "true";
    expect(verifyVectorHashesOnSync()).toBe(true);
  });
});
