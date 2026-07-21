"use strict";

const mockWorkspaceChatNew = jest.fn();
const mockGetLlm = jest.fn();
const mockWrite = jest.fn();
const mockCollectContexts = jest.fn();
const mockApplyCatalog = jest.fn();
const mockLlm = {
  promptWindowLimit: jest.fn(() => 4096),
  compressMessages: jest.fn(),
  getChatCompletion: jest.fn(),
};
const mockVectorDb = {
  hasNamespace: jest.fn(async () => false),
  namespaceCount: jest.fn(async () => 0),
  performSimilaritySearch: jest.fn(),
};

jest.mock("../../../models/workspaceChats", () => ({
  WorkspaceChats: {
    new: (...args) => mockWorkspaceChatNew(...args),
    markThreadHistoryInvalidV2: jest.fn(),
  },
}));
jest.mock("../../../utils/DocumentManager", () => ({
  DocumentManager: jest.fn().mockImplementation(() => ({
    pinnedDocs: () => Promise.resolve([]),
  })),
}));
jest.mock("../../../utils/helpers", () => ({
  getLLMProviderWithFallback: (...args) => mockGetLlm(...args),
  getVectorDbClass: () => mockVectorDb,
}));
jest.mock("../../../utils/helpers/chat/responses", () => ({
  writeResponseChunk: (...args) => mockWrite(...args),
}));
jest.mock("../../../utils/chats/index", () => ({
  chatPrompt: jest.fn(),
  sourceIdentifier: jest.fn(),
  recentChatHistory: jest.fn(async () => ({
    rawHistory: [],
    chatHistory: [],
  })),
  grepAllSlashCommands: jest.fn(async (message) => message),
}));
jest.mock("../../../utils/agents/ephemeral", () => ({
  EphemeralAgentHandler: {
    isAgentInvocation: jest.fn(async () => false),
  },
  EphemeralEventListener: jest.fn(),
}));
jest.mock("../../../models/telemetry", () => ({
  Telemetry: { sendTelemetry: jest.fn() },
}));
jest.mock("../../../utils/chats/generation", () => ({
  collectExternalContexts: (...args) => mockCollectContexts(...args),
  dedupeSources: (sources) => sources,
}));
jest.mock("../../../utils/offerKp/enrich", () => ({
  shopDbEnrichEnabled: () => true,
}));
jest.mock("../../../utils/offerKp/catalogPrompt", () => ({
  applyExternalContextsForLlm: (...args) => mockApplyCatalog(...args),
}));

const { ApiChatHandler } = require("../../../utils/chats/apiChatHandler");

describe("developer API deterministic grounding", () => {
  const workspace = {
    id: 1,
    slug: "offer-kp",
    chatMode: "automatic",
    chatProvider: "lmstudio",
    chatModel: "qwen",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspaceChatNew.mockResolvedValue({ chat: { id: 42 } });
    mockGetLlm.mockResolvedValue(mockLlm);
  });

  it("answers a greeting before resolving an LLM", async () => {
    const result = await ApiChatHandler.chatSync({
      workspace,
      message: "hello",
    });

    expect(result).toMatchObject({
      textResponse: expect.stringContaining("Hello"),
      metrics: { grounding: "deterministic_immediate" },
    });
    expect(mockGetLlm).not.toHaveBeenCalled();
  });

  it("returns trusted catalog evidence without model completion", async () => {
    const block =
      "[Каталог · purolat.com]\nТовар: Болт DIN 933 M10x80\nЦена: 12.50 RUB\nАртикул / SKU: SKU-10";
    mockCollectContexts.mockResolvedValue([
      { kind: "shopdb", contextTexts: [block], sources: [] },
    ]);
    mockApplyCatalog.mockReturnValue({
      catalogBlocks: [block],
      catalogInjected: true,
      contextTexts: [block],
      sources: [],
      userPrompt: "unused",
    });

    const result = await ApiChatHandler.chatSync({
      workspace,
      message: "найди болт DIN 933 M10x80",
    });

    expect(result).toMatchObject({
      textResponse: expect.stringContaining("SKU-10"),
      metrics: { grounding: "shopdb_direct" },
    });
    expect(mockLlm.compressMessages).not.toHaveBeenCalled();
    expect(mockLlm.getChatCompletion).not.toHaveBeenCalled();
  });

  it("uses the same direct catalog path for streaming API calls", async () => {
    const block =
      "[Каталог · purolat.com]\nТовар: Гайка DIN 934 M10\nЦена: 5.00 RUB\nАртикул / SKU: SKU-NUT-10";
    mockCollectContexts.mockResolvedValue([
      { kind: "shopdb", contextTexts: [block], sources: [] },
    ]);
    mockApplyCatalog.mockReturnValue({
      catalogBlocks: [block],
      catalogInjected: true,
      contextTexts: [block],
      sources: [],
      userPrompt: "unused",
    });

    await ApiChatHandler.streamChat({
      response: {},
      workspace,
      message: "найди гайку DIN 934 M10",
    });

    expect(mockWrite.mock.calls[0][1]).toMatchObject({
      textResponse: expect.stringContaining("SKU-NUT-10"),
      metrics: { grounding: "shopdb_direct" },
    });
    expect(mockLlm.compressMessages).not.toHaveBeenCalled();
    expect(mockLlm.getChatCompletion).not.toHaveBeenCalled();
  });
});
