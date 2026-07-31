"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  inspectCachedModel,
  forceModelRefresh,
  modelCachePaths,
  pinTransformersCacheEnv,
  purgeIncompleteOnnx,
  minOnnxBytesFor,
  MIN_ONNX_BYTES,
  MODEL_MIN_ONNX_BYTES,
} = require("../../../utils/EmbeddingEngines/native/modelDiskCache");

describe("modelDiskCache", () => {
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "native-embedder-cache-"));
    delete process.env.NATIVE_EMBEDDER_FORCE_REFRESH;
    delete process.env.EMBEDDING_MODEL_FORCE_REFRESH;
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    delete process.env.NATIVE_EMBEDDER_FORCE_REFRESH;
    delete process.env.EMBEDDING_MODEL_FORCE_REFRESH;
  });

  test("inspectCachedModel reports incomplete when onnx missing", () => {
    const info = inspectCachedModel(tmp, "Xenova/all-MiniLM-L6-v2");
    expect(info.complete).toBe(false);
    expect(info.onnxPath).toBeNull();
  });

  test("inspectCachedModel accepts quantized onnx above model min size", () => {
    const modelId = "Xenova/all-MiniLM-L6-v2";
    const { onnxQuantized } = modelCachePaths(tmp, modelId);
    fs.mkdirSync(path.dirname(onnxQuantized), { recursive: true });
    const size = minOnnxBytesFor(modelId);
    fs.writeFileSync(onnxQuantized, Buffer.alloc(size));
    const info = inspectCachedModel(tmp, modelId);
    expect(info.complete).toBe(true);
    expect(info.onnxPath).toBe(onnxQuantized);
    expect(info.size).toBe(size);
  });

  test("inspectCachedModel rejects e5 stub below 100MB floor", () => {
    const modelId = "MintplexLabs/multilingual-e5-small";
    const { onnxQuantized } = modelCachePaths(tmp, modelId);
    fs.mkdirSync(path.dirname(onnxQuantized), { recursive: true });
    // 16MB partial would previously pass MIN_ONNX_BYTES=1MB and lie "complete"
    fs.writeFileSync(onnxQuantized, Buffer.alloc(16_000_000));
    expect(inspectCachedModel(tmp, modelId).complete).toBe(false);
    expect(MODEL_MIN_ONNX_BYTES[modelId]).toBeGreaterThan(16_000_000);
  });

  test("inspectCachedModel rejects tiny/corrupt onnx", () => {
    const { onnxQuantized } = modelCachePaths(
      tmp,
      "MintplexLabs/multilingual-e5-small"
    );
    fs.mkdirSync(path.dirname(onnxQuantized), { recursive: true });
    fs.writeFileSync(onnxQuantized, Buffer.alloc(100));
    expect(
      inspectCachedModel(tmp, "MintplexLabs/multilingual-e5-small").complete
    ).toBe(false);
  });

  test("purgeIncompleteOnnx removes undersized weights", () => {
    const modelId = "Xenova/all-MiniLM-L6-v2";
    const { onnxQuantized } = modelCachePaths(tmp, modelId);
    fs.mkdirSync(path.dirname(onnxQuantized), { recursive: true });
    fs.writeFileSync(onnxQuantized, Buffer.alloc(1000));
    const removed = purgeIncompleteOnnx(tmp, modelId);
    expect(removed).toContain(onnxQuantized);
    expect(fs.existsSync(onnxQuantized)).toBe(false);
  });

  test("forceModelRefresh reads NATIVE_EMBEDDER_FORCE_REFRESH", () => {
    expect(forceModelRefresh()).toBe(false);
    process.env.NATIVE_EMBEDDER_FORCE_REFRESH = "1";
    expect(forceModelRefresh()).toBe(true);
  });

  test("pinTransformersCacheEnv points env at STORAGE models dir", () => {
    const env = {
      cacheDir: "/tmp/wrong",
      localModelPath: "/tmp/wrong2",
      allowLocalModels: false,
      allowRemoteModels: true,
      useFSCache: false,
    };
    pinTransformersCacheEnv(env, tmp, { localOnly: true });
    expect(env.cacheDir).toBe(tmp);
    expect(env.localModelPath).toBe(tmp);
    expect(env.allowLocalModels).toBe(true);
    expect(env.allowRemoteModels).toBe(false);
    expect(env.useFSCache).toBe(true);
    expect(fs.existsSync(tmp)).toBe(true);
    expect(process.env.TRANSFORMERS_CACHE).toBe(tmp);
  });

  test("MIN_ONNX_BYTES floor still exported", () => {
    expect(MIN_ONNX_BYTES).toBeGreaterThanOrEqual(1_000_000);
  });
});
