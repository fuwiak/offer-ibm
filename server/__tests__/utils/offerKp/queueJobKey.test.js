"use strict";

const {
  buildOfferKpJobId,
  sha256Hex,
  retrievalCacheKey,
} = require("../../../utils/offerKp/queue/jobKey");

describe("offerKp queue jobKey", () => {
  test("buildOfferKpJobId is stable for same inputs", () => {
    const a = buildOfferKpJobId({
      fileHash: "abc123",
      pipelineVersion: "p1",
      modelId: "qwen/qwen3-vl-8b",
      ocrPromptVersion: "v1",
    });
    const b = buildOfferKpJobId({
      fileHash: "abc123",
      pipelineVersion: "p1",
      modelId: "qwen/qwen3-vl-8b",
      ocrPromptVersion: "v1",
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  test("prompt or pipeline change yields new jobId", () => {
    const base = {
      fileHash: "abc123",
      pipelineVersion: "p1",
      modelId: "qwen/qwen3-vl-8b",
      ocrPromptVersion: "v1",
    };
    const a = buildOfferKpJobId(base);
    const b = buildOfferKpJobId({ ...base, ocrPromptVersion: "v2" });
    const c = buildOfferKpJobId({ ...base, pipelineVersion: "p2" });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  test("retrievalCacheKey includes limit + indexVersion", () => {
    const k1 = retrievalCacheKey({
      queryHash: "q",
      indexVersion: "1",
      limit: 10,
    });
    const k2 = retrievalCacheKey({
      queryHash: "q",
      indexVersion: "1",
      limit: 20,
    });
    expect(k1).not.toBe(k2);
    expect(sha256Hex("x")).toHaveLength(64);
  });
});
