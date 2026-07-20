const {
  formatOpenRouterConnectionError,
  isOpenRouterConnectionError,
  resolveOpenRouterBaseUrl,
  resetOpenRouterEgressCache,
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_EGRESS_PROXY_BASE_URL,
} = require("../../../utils/offerKpApp/openRouterEnv");

describe("openRouterEnv connection errors", () => {
  const prevBase = process.env.OPENROUTER_BASE_URL;

  afterEach(() => {
    if (prevBase === undefined) delete process.env.OPENROUTER_BASE_URL;
    else process.env.OPENROUTER_BASE_URL = prevBase;
    resetOpenRouterEgressCache();
  });

  it("detects opaque Connection error from OpenAI SDK", () => {
    expect(isOpenRouterConnectionError(new Error("Connection error."))).toBe(
      true
    );
  });

  it("hints egress tunnel when using local proxy base URL", () => {
    process.env.OPENROUTER_BASE_URL = DEFAULT_EGRESS_PROXY_BASE_URL;
    const msg = formatOpenRouterConnectionError(
      new Error("Connection error."),
      resolveOpenRouterBaseUrl()
    );
    expect(msg).toContain("egress");
    expect(msg).toContain("8787");
    expect(msg).toContain("openrouter-egress-proxy");
  });

  it("hints geo-block when using direct openrouter.ai", () => {
    process.env.OPENROUTER_BASE_URL = DEFAULT_OPENROUTER_BASE_URL;
    const msg = formatOpenRouterConnectionError(
      new Error("Connection error."),
      resolveOpenRouterBaseUrl()
    );
    expect(msg).toContain("geo-blocked");
    expect(msg).toContain("OPENROUTER_BASE_URL");
  });
});
