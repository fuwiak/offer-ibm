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
    expect(
      isLmStudioChatModelId(
        "paddlepaddle/paddleocr-vl-1.5-gguf/paddleocr-vl-1.5-mmproj.gguf"
      )
    ).toBe(false);
    expect(
      isLmStudioChatModelId(
        "paddlepaddle/paddleocr-vl-1.5-gguf/paddleocr-vl-1.5.gguf:2"
      )
    ).toBe(false);
  });

  it("maps remote API rows to picker entries", () => {
    const mapped = mapLmStudioRemoteModel({ id: "qwen/qwen3-vl-8b" });
    expect(mapped?.id).toBe("qwen/qwen3-vl-8b");
    expect(mapped?.name).toBe("Qwen3-VL-8B");
  });

  it("excludes PaddleOCR from chat picker (OCR-only model)", () => {
    expect(
      mapLmStudioRemoteModel({
        id: "paddlepaddle/paddleocr-vl-1.5-gguf/paddleocr-vl-1.5.gguf",
      })
    ).toBeNull();
  });

  it("ignores PaddleOCR mmproj and duplicate LM Studio instances", () => {
    expect(
      mapLmStudioRemoteModel({
        id: "paddlepaddle/paddleocr-vl-1.5-gguf/paddleocr-vl-1.5-mmproj.gguf",
      })
    ).toBeNull();
    expect(
      mapLmStudioRemoteModel({
        id: "paddlepaddle/paddleocr-vl-1.5-gguf/paddleocr-vl-1.5.gguf:2",
      })
    ).toBeNull();
  });

  it("coerces legacy PaddleOCR id to default chat model", () => {
    const {
      normalizeOfferKpModelId,
      resolveOfferKpModel,
      OFFER_KP_DEFAULT_MODEL,
    } = require("../../../config/offerKp.models");
    expect(normalizeOfferKpModelId("paddleocr-vl-1.5")).toBe(
      "paddlepaddle/paddleocr-vl-1.5-gguf/paddleocr-vl-1.5.gguf"
    );
    expect(resolveOfferKpModel("paddleocr-vl-1.5")).toBe(
      OFFER_KP_DEFAULT_MODEL
    );
  });

  it("merge keeps static catalog and overlays live VRAM state", () => {
    const merged = mergeLmStudioRemoteModels([
      { id: "qwen/qwen3-vl-8b", loadState: "loaded" },
      {
        id: "paddlepaddle/paddleocr-vl-1.5-gguf/paddleocr-vl-1.5.gguf",
        loadState: "not-loaded",
      },
      {
        id: "paddlepaddle/paddleocr-vl-1.5-gguf/paddleocr-vl-1.5-mmproj.gguf",
        loadState: "loaded",
      },
      { id: "openai/gpt-oss-20b" },
    ]);
    expect(merged.map((m) => m.id)).toEqual(
      expect.arrayContaining(["qwen/qwen3-vl-8b", "qwen/qwen3-vl-8b-thinking"])
    );
    expect(
      merged.some((m) => m.id.includes("paddleocr"))
    ).toBe(false);
    expect(merged.some((m) => m.id.includes("gpt-oss"))).toBe(false);
    const qwen8b = merged.find((m) => m.id === "qwen/qwen3-vl-8b");
    expect(qwen8b?.loaded).toBe(true);
  });
});

const describeLmStudioIntegration =
  process.env.RUN_LMSTUDIO_INTEGRATION === "1" ? describe : describe.skip;

describeLmStudioIntegration("fetchLmStudioModelCatalog integration", () => {
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
