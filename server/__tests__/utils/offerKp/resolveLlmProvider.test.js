const {
  resolveLlmProviderAndModel,
  resolveLlmProviderWithFallback,
  coerceToLocalModel,
} = require("../../../utils/offerKpApp/resolveLlmProvider");
const {
  pickRunnableLmStudioModel,
} = require("../../../utils/offerKpApp/lmStudioModels");
const {
  sanitizeMetricsForUi,
} = require("../../../utils/offerKpApp/teacherLlm");
const openRouterEnv = require("../../../utils/offerKpApp/openRouterEnv");

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

  it("hides OpenRouter model id from UI metrics when teacher is on", () => {
    process.env.OFFER_KP_TEACHER_LLM = "1";
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.OPENROUTER_MODEL_PREF = "qwen/qwen3.5-plus-20260420";
    process.env.LMSTUDIO_MODEL_PREF = "openai/gpt-oss-20b";

    const sanitized = sanitizeMetricsForUi({
      model: "qwen/qwen3.5-plus-20260420",
      provider: "OpenRouterLLM",
      duration: 38.5,
      outputTps: 52.89,
      teacher: true,
      teacherModel: "qwen/qwen3.5-plus-20260420",
    });

    expect(sanitized.model).toBe("openai/gpt-oss-20b");
    expect(sanitized.provider).toBe("LMStudioLLM");
    expect(sanitized.teacher).toBeUndefined();
    expect(sanitized.teacherModel).toBeUndefined();
  });

  it("defaults to OpenRouter teacher when key set and flag unset", () => {
    delete process.env.OFFER_KP_TEACHER_LLM;
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.OPENROUTER_MODEL_PREF = "qwen/qwen3-vl-235b-a22b-instruct";
    process.env.LMSTUDIO_MODEL_PREF = "openai/gpt-oss-20b";

    const resolved = resolveLlmProviderAndModel({
      provider: "lmstudio",
      model: "openai/gpt-oss-20b",
    });

    expect(resolved.provider).toBe("openrouter");
    expect(resolved.teacher).toBe(true);
    expect(resolved.model).toBe("qwen/qwen3-vl-235b-a22b-instruct");
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
        reachable: true,
      },
    });

    expect(resolved.provider).toBe("lmstudio");
    expect(resolved.model).toBe("openai/gpt-oss-20b");
    expect(resolved.teacher).toBe(false);
  });

  it("falls back to OpenRouter when LM Studio catalog is unreachable", () => {
    process.env.OFFER_KP_TEACHER_LLM = "0";
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.OPENROUTER_MODEL_PREF = "qwen/qwen3-vl-235b-a22b-instruct";
    process.env.LMSTUDIO_MODEL_PREF = "qwen/qwen3-vl-8b-thinking";

    const resolved = resolveLlmProviderAndModel({
      provider: "lmstudio",
      model: "qwen/qwen3-vl-8b-thinking",
      catalog: {
        ids: [],
        loadedIds: [],
        stateById: {},
        reachable: false,
        fetchError: true,
      },
    });

    expect(resolved.provider).toBe("openrouter");
    expect(resolved.teacher).toBe(true);
    expect(resolved.openRouterFallback).toBe(true);
    expect(resolved.model).toBe("qwen/qwen3-vl-235b-a22b-instruct");
  });

  it("keeps LM Studio catalog model ids from UI", () => {
    process.env.OFFER_KP_TEACHER_LLM = "0";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPEN_ROUTER_TOKEN;
    expect(
      coerceToLocalModel("google/gemma-4-26b-a4b", [
        "google/gemma-4-26b-a4b",
        "openai/gpt-oss-20b",
      ])
    ).toBe("google/gemma-4-26b-a4b");
  });

  it("does not mutate global LMSTUDIO_MODEL_PREF on resolve", () => {
    process.env.OFFER_KP_TEACHER_LLM = "0";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPEN_ROUTER_TOKEN;
    process.env.LMSTUDIO_MODEL_PREF = "openai/gpt-oss-20b";
    const resolved = resolveLlmProviderAndModel({
      provider: "lmstudio",
      model: "google/gemma-4-26b-a4b",
      catalog: {
        ids: ["google/gemma-4-26b-a4b", "openai/gpt-oss-20b"],
        loadedIds: ["google/gemma-4-26b-a4b"],
        stateById: { "google/gemma-4-26b-a4b": "loaded" },
        reachable: true,
      },
    });
    expect(resolved.model).toBe("google/gemma-4-26b-a4b");
    expect(process.env.LMSTUDIO_MODEL_PREF).toBe("openai/gpt-oss-20b");
  });

  it("falls back to loaded model when preferred is not in VRAM", () => {
    process.env.OFFER_KP_TEACHER_LLM = "0";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPEN_ROUTER_TOKEN;
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
        reachable: true,
      },
    });
    expect(resolved.model).toBe("openai/gpt-oss-20b");
    expect(resolved.modelFallback?.from).toBe("google/gemma-4-26b-a4b");
  });

  it("falls back to LM Studio when teacher OpenRouter/egress is unreachable", async () => {
    process.env.OFFER_KP_TEACHER_LLM = "1";
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.OPENROUTER_MODEL_PREF = "qwen/qwen3-vl-235b-a22b-instruct";
    process.env.LMSTUDIO_MODEL_PREF = "openai/gpt-oss-20b";

    const probeSpy = jest
      .spyOn(openRouterEnv, "probeOpenRouterReachable")
      .mockResolvedValue(false);
    const egressSpy = jest
      .spyOn(openRouterEnv, "ensureOpenRouterEgressBaseUrl")
      .mockResolvedValue("http://127.0.0.1:8787/api/v1");
    const lmStudioModels = require("../../../utils/offerKpApp/lmStudioModels");
    const catalogSpy = jest
      .spyOn(lmStudioModels, "fetchLmStudioModelCatalog")
      .mockResolvedValue({
        ids: ["openai/gpt-oss-20b"],
        loadedIds: ["openai/gpt-oss-20b"],
        stateById: { "openai/gpt-oss-20b": "loaded" },
        reachable: true,
      });

    const resolved = await resolveLlmProviderWithFallback({
      provider: "lmstudio",
      model: "openai/gpt-oss-20b",
    });

    expect(resolved.provider).toBe("lmstudio");
    expect(resolved.teacher).toBe(false);
    expect(resolved.model).toBe("openai/gpt-oss-20b");
    probeSpy.mockRestore();
    egressSpy.mockRestore();
    catalogSpy.mockRestore();
  });

  it("uses LM Studio even when catalog looks unreachable if OpenRouter is down", async () => {
    process.env.OFFER_KP_TEACHER_LLM = "1";
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.LMSTUDIO_MODEL_PREF = "openai/gpt-oss-20b";

    jest
      .spyOn(openRouterEnv, "probeOpenRouterReachable")
      .mockResolvedValue(false);
    jest
      .spyOn(openRouterEnv, "ensureOpenRouterEgressBaseUrl")
      .mockResolvedValue("http://127.0.0.1:8787/api/v1");
    const lmStudioModels = require("../../../utils/offerKpApp/lmStudioModels");
    jest.spyOn(lmStudioModels, "fetchLmStudioModelCatalog").mockResolvedValue({
      ids: [],
      loadedIds: [],
      stateById: {},
      reachable: false,
      fetchError: true,
    });

    const resolved = await resolveLlmProviderWithFallback({
      model: "openai/gpt-oss-20b",
    });

    expect(resolved.provider).toBe("lmstudio");
    expect(resolved.teacher).toBe(false);
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
