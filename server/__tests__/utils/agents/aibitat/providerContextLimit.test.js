/* eslint-env jest, node */

/**
 * Регрессия прод-бага: web-scraping.js обрывался на «exceeds the model's
 * context limit» при 830/33K токенов страницы.
 *
 * Корень: AIbitat#reply() перезаписывает aibitat.provider СТРОКИ
 * ("openrouter") на СЭКЗЕМПЛЯР провайдера (объект) после первого completion
 * — это нужно chat-history.js для aibitat.provider.getUsage(). Но
 * web-scraping.js / summarize.js / filesystem/lib.js передают этот же
 * this.super.provider в Provider.contextLimit(provider, model), а тот
 * делает `switch (provider)` по СТРОКЕ. Объект не матчится ни с одним
 * case → getLLMProviderClass возвращает null → жёсткий фолбэк 8000
 * токенов для ЛЮБОЙ модели, включая teacher-модели с окном 200K–1M+.
 *
 * Это воспроизводимо на любом провайдере, даже без обращения к реальной сети:
 * getProviderForConfig() теперь тегирует инстанс `.providerKey`, и
 * Provider.contextLimit() должен уметь читать этот тег.
 */

const Provider = require("../../../../utils/agents/aibitat/providers/ai-provider");

describe("Provider.contextLimit — provider as string vs tagged instance", () => {
  const OpenRouterLLM =
    require("../../../../utils/AiProviders/openRouter").OpenRouterLLM;

  it("resolves the real window when called with the provider string (baseline)", () => {
    expect(Provider.contextLimit("openrouter", "google/gemini-2.5-flash")).toBe(
      1_048_576
    );
  });

  it("resolves the SAME window from a tagged provider instance, not the 8000 fallback", () => {
    // Simulates what aibitat.provider becomes after AIbitat#reply()'s first
    // completion: an instantiated provider object, tagged by
    // getProviderForConfig() with the original provider key.
    const fakeProviderInstance = {
      providerKey: "openrouter",
      model: "google/gemini-2.5-flash",
      getUsage: () => ({}),
    };

    const limit = Provider.contextLimit(
      fakeProviderInstance,
      fakeProviderInstance.model
    );
    expect(limit).toBe(1_048_576);
    expect(limit).not.toBe(8_000);
  });

  it("falls back to provider.model when modelName is omitted", () => {
    const fakeProviderInstance = {
      providerKey: "openrouter",
      model: "google/gemini-2.5-flash",
    };
    expect(Provider.contextLimit(fakeProviderInstance)).toBe(1_048_576);
  });

  it("still returns 8000 for a truly untagged object (no silent success claim)", () => {
    expect(Provider.contextLimit({ model: "whatever" }, "whatever")).toBe(
      8_000
    );
  });

  it("keeps returning 8000 for a provider key unknown to getLLMProviderClass", () => {
    expect(Provider.contextLimit("totally-unknown-provider", "any-model")).toBe(
      8_000
    );
  });

  // Sanity: OpenRouterLLM itself resolves the curated/cached window either way.
  it("OpenRouterLLM.promptWindowLimit matches what contextLimit returns", () => {
    expect(OpenRouterLLM.promptWindowLimit("google/gemini-2.5-flash")).toBe(
      Provider.contextLimit("openrouter", "google/gemini-2.5-flash")
    );
  });
});

describe("AIbitat#getProviderForConfig tags instances with providerKey", () => {
  it("tags a constructed provider instance with the resolved provider key", () => {
    const AIbitat = require("../../../../utils/agents/aibitat/index.js");
    const aibitat = new AIbitat({ provider: "openrouter", model: "test" });
    const instance = aibitat.getProviderForConfig({
      provider: "openrouter",
      model: "google/gemini-2.5-flash",
    });
    expect(instance.providerKey).toBe("openrouter");
  });

  it("passes an already-tagged instance straight through unchanged", () => {
    const AIbitat = require("../../../../utils/agents/aibitat/index.js");
    const aibitat = new AIbitat({ provider: "openrouter", model: "test" });
    const tagged = { providerKey: "openrouter", model: "x" };
    expect(aibitat.getProviderForConfig({ provider: tagged })).toBe(tagged);
  });
});

describe("Provider.LangChainChatModel — provider instance must not JSON.stringify", () => {
  const prevKey = process.env.OPENROUTER_API_KEY;

  beforeAll(() => {
    process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "sk-or-test";
  });

  afterAll(() => {
    if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prevKey;
  });

  it("accepts a tagged provider instance without circular JSON error", () => {
    const circular = { providerKey: "openrouter", model: "openai/gpt-4o-mini" };
    circular.self = circular; // would blow up JSON.stringify(provider)
    expect(() =>
      Provider.LangChainChatModel(circular, { temperature: 0 })
    ).not.toThrow();
  });

  it("throws a safe message for unknown provider objects (no circular stringify)", () => {
    const circular = { providerKey: "totally-unknown", model: "x" };
    circular.self = circular;
    expect(() => Provider.LangChainChatModel(circular)).toThrow(
      /Unsupported provider totally-unknown/
    );
  });
});
