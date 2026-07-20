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
  const prevTeacher = process.env.OFFER_KP_TEACHER_LLM;
  const prevOrKey = process.env.OPENROUTER_API_KEY;
  const prevOrToken = process.env.OPEN_ROUTER_TOKEN;
  const prevOrModel = process.env.OPENROUTER_MODEL_PREF;

  afterEach(() => {
    if (prevPref === undefined) delete process.env.LMSTUDIO_MODEL_PREF;
    else process.env.LMSTUDIO_MODEL_PREF = prevPref;
    if (prevTeacher === undefined) delete process.env.OFFER_KP_TEACHER_LLM;
    else process.env.OFFER_KP_TEACHER_LLM = prevTeacher;
    if (prevOrKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prevOrKey;
    if (prevOrToken === undefined) delete process.env.OPEN_ROUTER_TOKEN;
    else process.env.OPEN_ROUTER_TOKEN = prevOrToken;
    if (prevOrModel === undefined) delete process.env.OPENROUTER_MODEL_PREF;
    else process.env.OPENROUTER_MODEL_PREF = prevOrModel;
  });

  it("uses OpenRouter teacher when OFFER_KP_TEACHER_LLM=1 and key set", () => {
    process.env.OFFER_KP_TEACHER_LLM = "1";
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.OPENROUTER_MODEL_PREF = "qwen/qwen3-vl-235b-a22b-instruct";
    process.env.LMSTUDIO_MODEL_PREF = "openai/gpt-oss-20b";

    const resolved = resolveLlmProviderAndModel({
      provider: "lmstudio",
      model: "openai/gpt-oss-20b",
    });

    expect(resolved.provider).toBe("openrouter");
    expect(resolved.model).toBe("qwen/qwen3-vl-235b-a22b-instruct");
    expect(resolved.teacher).toBe(true);
    expect(resolved.displayProvider).toBe("lmstudio");
    expect(resolved.displayModel).toBe("openai/gpt-oss-20b");
    expect(process.env.LMSTUDIO_MODEL_PREF).toBe("openai/gpt-oss-20b");
  });

  it("stays on LM Studio when teacher flag is off", () => {
    process.env.OFFER_KP_TEACHER_LLM = "0";
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.LMSTUDIO_MODEL_PREF = "openai/gpt-oss-20b";

    const resolved = resolveLlmProviderAndModel({
      provider: "lmstudio",
      model: "openai/gpt-oss-20b",
      catalog: {
        ids: ["openai/gpt-oss-20b"],
        loadedIds: ["openai/gpt-oss-20b"],
        stateById: { "openai/gpt-oss-20b": "loaded" },
      },
    });

    expect(resolved.provider).toBe("lmstudio");
    expect(resolved.model).toBe("openai/gpt-oss-20b");
    expect(resolved.teacher).toBe(false);
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

  it("falls back to loaded model when preferred is not in VRAM", () => {
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
    expect(resolved.model).toBe("openai/gpt-oss-20b");
    expect(resolved.modelFallback?.from).toBe("google/gemma-4-26b-a4b");
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

  it("falls back to loaded model when preferred is not in VRAM", () => {
    const picked = pickRunnableLmStudioModel("google/gemma-4-26b-a4b", catalog);
    expect(picked.model).toBe("openai/gpt-oss-20b");
    expect(picked.fallback).toBe(true);
    expect(picked.reason).toBe("model_not_loaded");
  });

  it("falls back when preferred is not in catalog", () => {
    const picked = pickRunnableLmStudioModel("unknown/model", catalog);
    expect(picked.model).toBe("openai/gpt-oss-20b");
    expect(picked.fallback).toBe(true);
  });
});
