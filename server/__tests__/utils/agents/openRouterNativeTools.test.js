/* eslint-env jest, node */

describe("OpenRouterProvider.supportsNativeToolCalling", () => {
  const prevSupport = process.env.PROVIDER_SUPPORTS_NATIVE_TOOL_CALLING;
  const prevDisable = process.env.PROVIDER_DISABLE_NATIVE_TOOL_CALLING;
  const prevKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    jest.resetModules();
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    delete process.env.PROVIDER_SUPPORTS_NATIVE_TOOL_CALLING;
    delete process.env.PROVIDER_DISABLE_NATIVE_TOOL_CALLING;
  });

  afterEach(() => {
    if (prevSupport === undefined)
      delete process.env.PROVIDER_SUPPORTS_NATIVE_TOOL_CALLING;
    else process.env.PROVIDER_SUPPORTS_NATIVE_TOOL_CALLING = prevSupport;
    if (prevDisable === undefined)
      delete process.env.PROVIDER_DISABLE_NATIVE_TOOL_CALLING;
    else process.env.PROVIDER_DISABLE_NATIVE_TOOL_CALLING = prevDisable;
    if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prevKey;
  });

  function loadProvider() {
    return require("../../../utils/agents/aibitat/providers/openrouter");
  }

  it("defaults to native tools ON when ENV unset", () => {
    const OpenRouterProvider = loadProvider();
    const p = new OpenRouterProvider({ model: "qwen/qwen3.5-plus" });
    expect(p.supportsNativeToolCalling()).toBe(true);
  });

  it("respects PROVIDER_SUPPORTS_NATIVE_TOOL_CALLING allowlist", () => {
    process.env.PROVIDER_SUPPORTS_NATIVE_TOOL_CALLING = "groq,litellm";
    const OpenRouterProvider = loadProvider();
    const p = new OpenRouterProvider({ model: "qwen/qwen3.5-plus" });
    expect(p.supportsNativeToolCalling()).toBe(false);
  });

  it("enables when allowlist includes openrouter", () => {
    process.env.PROVIDER_SUPPORTS_NATIVE_TOOL_CALLING =
      "generic-openai,openrouter";
    const OpenRouterProvider = loadProvider();
    const p = new OpenRouterProvider({ model: "qwen/qwen3.5-plus" });
    expect(p.supportsNativeToolCalling()).toBe(true);
  });

  it("disables when PROVIDER_DISABLE_NATIVE_TOOL_CALLING includes openrouter", () => {
    process.env.PROVIDER_DISABLE_NATIVE_TOOL_CALLING = "openrouter";
    const OpenRouterProvider = loadProvider();
    const p = new OpenRouterProvider({ model: "qwen/qwen3.5-plus" });
    expect(p.supportsNativeToolCalling()).toBe(false);
  });
});
