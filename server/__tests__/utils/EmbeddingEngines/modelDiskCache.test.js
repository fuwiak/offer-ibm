"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  inspectCachedModel,
  forceModelRefresh,
  modelCachePaths,
  pinTransformersCacheEnv,
  MIN_ONNX_BYTES,
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

  test("inspectCachedModel accepts quantized onnx above min size", () => {
    const { onnxQuantized } = modelCachePaths(tmp, "Xenova/all-MiniLM-L6-v2");
    fs.mkdirSync(path.dirname(onnxQuantized), { recursive: true });
    fs.writeFileSync(onnxQuantized, Buffer.alloc(MIN_ONNX_BYTES));
    const info = inspectCachedModel(tmp, "Xenova/all-MiniLM-L6-v2");
    expect(info.complete).toBe(true);
    expect(info.onnxPath).toBe(onnxQuantized);
    expect(info.size).toBe(MIN_ONNX_BYTES);
  });

  test("inspectCachedModel rejects tiny/corrupt onnx", () => {
    const { onnxQuantized } = modelCachePaths(
      tmp,
      "MintplexLabs/multilingual-e5-small"
    );
    fs.mkdirSync(path.dirname(onnxQuantized), { recursive: true });
    fs.writeFileSync(onnxQuantized, Buffer.alloc(100));
    expect(inspectCachedModel(tmp, "MintplexLabs/multilingual-e5-small").complete).toBe(
      false
    );
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
      useFSCache: false,
    };
    pinTransformersCacheEnv(env, tmp);
    expect(env.cacheDir).toBe(tmp);
    expect(env.localModelPath).toBe(tmp);
    expect(env.allowLocalModels).toBe(true);
    expect(env.useFSCache).toBe(true);
    expect(fs.existsSync(tmp)).toBe(true);
  });
});
