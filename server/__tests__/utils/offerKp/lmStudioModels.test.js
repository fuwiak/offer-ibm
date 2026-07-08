const {
  mergeLmStudioRemoteModels,
  mapLmStudioRemoteModel,
} = require("../../../config/offerKp.models");
const {
  isLmStudioChatModelId,
  fetchLmStudioModelCatalog,
  pickRunnableLmStudioModel,
} = require("../../../utils/offerKpApp/lmStudioModels");

describe("lmStudioModels", () => {
  it("excludes embedding models from chat catalog", () => {
    expect(isLmStudioChatModelId("google/gemma-4-12b")).toBe(true);
    expect(isLmStudioChatModelId("text-embedding-nomic-embed-text-v1.5")).toBe(
      false
    );
  });

  it("maps remote API rows to picker entries", () => {
    const mapped = mapLmStudioRemoteModel({ id: "qwen/qwen3-vl-8b" });
    expect(mapped?.id).toBe("qwen/qwen3-vl-8b");
    expect(mapped?.name).toBe("Qwen3-VL-8B");
  });

  it("maps PaddleOCR-VL from LM Studio catalog", () => {
    const mapped = mapLmStudioRemoteModel({ id: "paddleocr-vl-1.5" });
    expect(mapped?.id).toBe("paddleocr-vl-1.5");
    expect(mapped?.name).toBe("PaddleOCR-VL 1.5");
  });

  it("merge keeps static catalog and overlays live VRAM state", () => {
    const merged = mergeLmStudioRemoteModels([
      { id: "qwen/qwen3-vl-8b", loadState: "loaded" },
      { id: "paddleocr-vl-1.5", loadState: "not-loaded" },
      { id: "openai/gpt-oss-20b" },
    ]);
    expect(merged.map((m) => m.id)).toEqual(
      expect.arrayContaining([
        "qwen/qwen3-vl-8b",
        "qwen/qwen3-vl-8b-thinking",
        "paddleocr-vl-1.5",
      ])
    );
    expect(merged.some((m) => m.id.includes("gpt-oss"))).toBe(false);
    const qwen8b = merged.find((m) => m.id === "qwen/qwen3-vl-8b");
    expect(qwen8b?.loaded).toBe(true);
  });
});

describe("fetchLmStudioModelCatalog integration", () => {
  it(
    "fetches live model ids and VRAM load state from LM Studio host",
    async () => {
      const catalog = await fetchLmStudioModelCatalog({ forceRefresh: true });
      expect(Array.isArray(catalog.ids)).toBe(true);
      expect(Array.isArray(catalog.loadedIds)).toBe(true);
      if (catalog.ids.length > 0) {
        expect(catalog.ids.some((id) => id.includes("/"))).toBe(true);
      }
    },
    20_000
  );
});
