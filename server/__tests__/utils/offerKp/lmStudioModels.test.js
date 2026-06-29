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
    const mapped = mapLmStudioRemoteModel({ id: "google/gemma-4-12b-qat" });
    expect(mapped?.id).toBe("google/gemma-4-12b-qat");
    expect(mapped?.name).toBe("Gemma 4 12B QAT");
  });

  it("merge prefers live catalog over static fallback", () => {
    const merged = mergeLmStudioRemoteModels([
      { id: "google/gemma-4-12b" },
      { id: "openai/gpt-oss-20b" },
    ]);
    expect(merged.map((m) => m.id)).toEqual(
      expect.arrayContaining(["google/gemma-4-12b", "openai/gpt-oss-20b"])
    );
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
