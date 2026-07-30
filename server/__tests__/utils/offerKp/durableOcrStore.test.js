"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

describe("durableOcrStore", () => {
  let tmpDir;
  let store;

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "offerkp-ocr-cache-"));
    process.env.STORAGE_DIR = tmpDir;
    process.env.OFFER_KP_DURABLE_OCR_CACHE = "1";
    process.env.OFFER_KP_DURABLE_OCR_REDIS = "0";
    store = require("../../../utils/offerKp/queue/durableOcrStore");
  });

  afterEach(() => {
    delete process.env.STORAGE_DIR;
    delete process.env.OFFER_KP_DURABLE_OCR_CACHE;
    delete process.env.OFFER_KP_DURABLE_OCR_REDIS;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("writes OCR to disk and reloads without Redis", async () => {
    const jobId = "a".repeat(64);
    const ok = await store.setDurableOcr(jobId, {
      text: "Болт DIN 933 M10x50",
      lines: [{ name: "bolt" }],
      engine: "qwen3-vl-test",
    });
    expect(ok).toBe(true);

    const loaded = await store.getDurableOcr(jobId);
    expect(loaded.text).toContain("DIN 933");
    expect(loaded.source).toBe("disk");
    expect(loaded.engine).toBe("qwen3-vl-test");
    expect(fs.existsSync(store.filePathForJobId(jobId))).toBe(true);
  });

  test("empty text is not stored", async () => {
    const jobId = "b".repeat(64);
    expect(await store.setDurableOcr(jobId, { text: "  " })).toBe(false);
    expect(await store.getDurableOcr(jobId)).toBeNull();
  });

  test("disabled flag skips store", async () => {
    process.env.OFFER_KP_DURABLE_OCR_CACHE = "0";
    jest.resetModules();
    store = require("../../../utils/offerKp/queue/durableOcrStore");
    expect(await store.setDurableOcr("c".repeat(64), { text: "x" })).toBe(
      false
    );
  });
});
