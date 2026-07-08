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

  it("merge prefers live catalog over static fallback", () => {
    const merged = mergeLmStudioRemoteModels([
      { id: "qwen/qwen3-vl-8b" },
      { id: "qwen/qwen2.5-vl-7b" },
      { id: "openai/gpt-oss-20b" },
    ]);
    expect(merged.map((m) => m.id)).toEqual(
      expect.arrayContaining(["qwen/qwen3-vl-8b", "qwen/qwen2.5-vl-7b"])
    );
    expect(merged.some((m) => m.id.includes("gpt-oss"))).toBe(false);
    expect(merged.some((m) => m.id.includes("embed"))).toBe(false);
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
