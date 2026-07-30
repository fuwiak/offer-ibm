"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

describe("durableMatchStore", () => {
  let tmpDir;
  let store;

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "offerkp-match-cache-"));
    process.env.STORAGE_DIR = tmpDir;
    process.env.OFFER_KP_DURABLE_MATCH_CACHE = "1";
    process.env.OFFER_KP_DURABLE_MATCH_TTL_SEC = "3600";
    // File-only in unit tests — avoid Redis connect hangs.
    process.env.OFFER_KP_DURABLE_MATCH_REDIS = "0";
    store = require("../../../utils/offerKp/db/durableMatchStore");
  });

  afterEach(() => {
    delete process.env.STORAGE_DIR;
    delete process.env.OFFER_KP_DURABLE_MATCH_CACHE;
    delete process.env.OFFER_KP_DURABLE_MATCH_TTL_SEC;
    delete process.env.OFFER_KP_DURABLE_MATCH_REDIS;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("persists identity without prices and reloads after clear RAM", async () => {
    const key = "match:v1:deterministic-prod-v1:idx1:abc";
    const line = {
      productId: "99",
      article: "SKU-99",
      matchType: "exact",
      allowPrice: true,
      unitPriceNet: 18.5,
      priceWithVat: 22.2,
      lineTotal: 185,
      quantity: 10,
      name: "Болт DIN 933",
    };

    const ok = await store.setDurableMatchIdentity(key, line);
    expect(ok).toBe(true);

    const loaded = await store.getDurableMatchIdentity(key);
    expect(loaded).toBeTruthy();
    expect(loaded.productId).toBe("99");
    expect(loaded.matchType).toBe("exact");
    expect(loaded.unitPriceNet).toBeUndefined();
    expect(loaded.priceWithVat).toBeUndefined();
    expect(loaded.lineTotal).toBeUndefined();
    expect(loaded._cacheLayer).toBe("identity");
  });

  test("different keys do not collide", async () => {
    await store.setDurableMatchIdentity("key-a", {
      productId: "1",
      matchType: "exact",
    });
    await store.setDurableMatchIdentity("key-b", {
      productId: "2",
      matchType: "analog",
    });
    expect((await store.getDurableMatchIdentity("key-a")).productId).toBe("1");
    expect((await store.getDurableMatchIdentity("key-b")).productId).toBe("2");
  });

  test("disabled flag skips persist", async () => {
    process.env.OFFER_KP_DURABLE_MATCH_CACHE = "0";
    jest.resetModules();
    store = require("../../../utils/offerKp/db/durableMatchStore");
    const ok = await store.setDurableMatchIdentity("k", { productId: "1" });
    expect(ok).toBe(false);
    expect(await store.getDurableMatchIdentity("k")).toBeNull();
  });
});
