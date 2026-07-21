"use strict";

const mockWorkspaceGet = jest.fn();
const mockGetLlm = jest.fn();
const mockWrite = jest.fn();
const mockGetShopDbContext = jest.fn();
const mockApplyCatalog = jest.fn();
const mockGetHistory = jest.fn();
const mockAppendHistory = jest.fn();

jest.mock("../../../models/workspace", () => ({
  Workspace: { get: (...args) => mockWorkspaceGet(...args) },
}));
jest.mock("../../../utils/helpers", () => ({
  getLLMProviderWithFallback: (...args) => mockGetLlm(...args),
}));
jest.mock("../../../utils/chats/index", () => ({ chatPrompt: jest.fn() }));
jest.mock("../../../utils/helpers/chat/responses", () => ({
  writeResponseChunk: (...args) => mockWrite(...args),
  handleDefaultStreamResponseV2: jest.fn(),
}));
jest.mock("../../../utils/offerKp/enrich", () => ({
  getShopDbContext: (...args) => mockGetShopDbContext(...args),
  shopDbEnrichEnabled: () => true,
}));
jest.mock("../../../utils/offerKp/catalogPrompt", () => ({
  applyExternalContextsForLlm: (...args) => mockApplyCatalog(...args),
}));
jest.mock("../../../utils/offerKp/offerKpPublicSession", () => ({
  getPublicChatHistory: (...args) => mockGetHistory(...args),
  appendPublicChatMessage: (...args) => mockAppendHistory(...args),
}));

const {
  streamOfferKpPublicChat,
} = require("../../../utils/chats/offerKpPublic");

describe("OfferKP public deterministic grounding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspaceGet.mockResolvedValue({
      id: 1,
      slug: "offerKp-public",
      chatProvider: "lmstudio",
      chatModel: "qwen",
    });
    mockGetHistory.mockReturnValue([]);
  });

  it("answers greetings without loading or calling an LLM", async () => {
    await streamOfferKpPublicChat({}, "hello", "session-1");

    expect(mockGetLlm).not.toHaveBeenCalled();
    expect(mockGetShopDbContext).not.toHaveBeenCalled();
    expect(mockWrite.mock.calls[0][1]).toMatchObject({
      textResponse: expect.stringContaining("Hello"),
      metrics: { grounding: "deterministic_immediate" },
    });
  });

  it("returns only trusted ShopDB blocks without calling an LLM", async () => {
    const block =
      "[Каталог · purolat.com]\nТовар: Болт DIN 933 M10x80\nЦена: 12.50 RUB\nАртикул / SKU: SKU-10";
    mockGetShopDbContext.mockResolvedValue({
      contextTexts: [block],
      sources: [{ title: "SKU-10" }],
      flags: {},
    });
    mockApplyCatalog.mockReturnValue({
      catalogBlocks: [block],
      contextTexts: [block],
      sources: [{ title: "SKU-10" }],
      userPrompt: "unused",
    });

    await streamOfferKpPublicChat({}, "найди болт DIN 933 M10x80", "session-2");

    expect(mockGetLlm).not.toHaveBeenCalled();
    expect(mockWrite.mock.calls[0][1]).toMatchObject({
      textResponse: expect.stringContaining("SKU-10"),
      metrics: { grounding: "shopdb_direct" },
    });
  });
});
