const {
  resolveLlmProviderAndModel,
  resolveLlmProviderWithFallback,
  coerceToLocalModel,
} = require("../../../utils/offerKpApp/resolveLlmProvider");
const {
  pickRunnableLmStudioModel,
} = require("../../../utils/offerKpApp/lmStudioModels");

describe("resolveLlmProvider", () => {
  const prevPref = process.env.LMSTUDIO_MODEL_PREF;

  afterEach(() => {
    if (prevPref === undefined) delete process.env.LMSTUDIO_MODEL_PREF;
    else process.env.LMSTUDIO_MODEL_PREF = prevPref;
  });

  it("keeps LM Studio catalog model ids from UI", () => {
    expect(
      coerceToLocalModel("google/gemma-4-26b-a4b", [
        "google/gemma-4-26b-a4b",
        "openai/gpt-oss-20b",
      ])
    ).toBe("google/gemma-4-26b-a4b");
  });

  it("does not mutate global LMSTUDIO_MODEL_PREF on resolve", () => {
    process.env.LMSTUDIO_MODEL_PREF = "openai/gpt-oss-20b";
    const resolved = resolveLlmProviderAndModel({
      provider: "lmstudio",
      model: "google/gemma-4-26b-a4b",
      catalog: {
        ids: ["google/gemma-4-26b-a4b", "openai/gpt-oss-20b"],
        loadedIds: ["google/gemma-4-26b-a4b"],
        stateById: { "google/gemma-4-26b-a4b": "loaded" },
      },
    });
    expect(resolved.model).toBe("google/gemma-4-26b-a4b");
    expect(process.env.LMSTUDIO_MODEL_PREF).toBe("openai/gpt-oss-20b");
  });

  it("keeps catalog model when it is not yet loaded in VRAM", () => {
    const resolved = resolveLlmProviderAndModel({
      provider: "lmstudio",
      model: "google/gemma-4-26b-a4b",
      catalog: {
        ids: ["google/gemma-4-26b-a4b", "openai/gpt-oss-20b"],
        loadedIds: ["openai/gpt-oss-20b"],
        stateById: {
          "google/gemma-4-26b-a4b": "loading",
          "openai/gpt-oss-20b": "loaded",
        },
      },
    });
    expect(resolved.model).toBe("google/gemma-4-26b-a4b");
    expect(resolved.modelFallback).toBeNull();
  });
});

describe("pickRunnableLmStudioModel", () => {
  const catalog = {
    ids: [
      "openai/gpt-oss-20b",
      "google/gemma-4-26b-a4b",
      "google/gemma-4-12b",
    ],
    loadedIds: ["openai/gpt-oss-20b"],
    stateById: {
      "openai/gpt-oss-20b": "loaded",
      "google/gemma-4-26b-a4b": "loading",
      "google/gemma-4-12b": "not-loaded",
    },
  };

  it("returns preferred model when loaded", () => {
    expect(
      pickRunnableLmStudioModel("openai/gpt-oss-20b", catalog).model
    ).toBe("openai/gpt-oss-20b");
  });

  it("keeps catalog model when preferred is not loaded yet", () => {
    const picked = pickRunnableLmStudioModel("google/gemma-4-26b-a4b", catalog);
    expect(picked.model).toBe("google/gemma-4-26b-a4b");
    expect(picked.fallback).toBe(false);
  });

  it("falls back when preferred is not in catalog", () => {
    const picked = pickRunnableLmStudioModel("unknown/model", catalog);
    expect(picked.model).toBe("openai/gpt-oss-20b");
    expect(picked.fallback).toBe(true);
  });
});
