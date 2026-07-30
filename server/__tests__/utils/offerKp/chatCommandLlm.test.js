"use strict";

jest.mock("../../../utils/helpers", () => ({
  getLLMProviderWithFallback: jest.fn(),
}));

const { getLLMProviderWithFallback } = require("../../../utils/helpers");
const {
  parseChatCommandAnswer,
  planOfferKpChatCommand,
  routeFromChatCommand,
} = require("../../../utils/offerKp/chatCommandLlm");

describe("chatCommandLlm", () => {
  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.OFFER_KP_CHAT_COMMAND_LLM;
  });

  function mockAnswer(textResponse) {
    const getChatCompletion = jest.fn().mockResolvedValue({ textResponse });
    getLLMProviderWithFallback.mockResolvedValue({ getChatCompletion });
    return getChatCompletion;
  }

  it("parses a closed command with edit arguments", () => {
    expect(
      parseChatCommandAnswer(
        '{"command":"quote_set_price","target":"DIN 933 M10","value":"50","row":2}'
      )
    ).toEqual({
      command: "quote_set_price",
      target: "DIN 933 M10",
      value: "50",
      row: 2,
    });
    expect(
      parseChatCommandAnswer(
        '{"command":"delete_database","target":"","value":"","row":0}'
      )
    ).toBeNull();
  });

  it("uses one constrained planner for arbitrary chat intent", async () => {
    const completion = mockAnswer(
      '{"command":"quote_set_customer","target":"","value":"ACME","row":0}'
    );
    const plan = await planOfferKpChatCommand("tak, ustaw go", {
      context: "Użytkownik: klientem w ofercie ma być ACME",
    });
    expect(plan.command).toBe("quote_set_customer");
    expect(completion.mock.calls[0][0][1].content).toContain(
      "klientem w ofercie ma być ACME"
    );
    expect(routeFromChatCommand(plan).primaryIntent).toBe("edit_quote");
    expect(completion.mock.calls[0][1].response_format.json_schema.name).toBe(
      "chat_command"
    );
  });

  it.each([
    ["catalog_search", "product_search"],
    ["quote_create", "create_quote"],
    ["document_question", "document_question"],
    ["data_question", "data_question"],
    ["system_help", "system_help"],
    ["casual", "casual_or_test"],
    ["unsafe", "unsafe_or_forbidden"],
    ["quote_get_total", "document_question"],
  ])("maps %s to %s policy intent", (command, intent) => {
    expect(
      routeFromChatCommand({ command, target: "", value: "", row: 0 })
        .primaryIntent
    ).toBe(intent);
  });

  it("fails safe to the caller's deterministic fallback", async () => {
    getLLMProviderWithFallback.mockRejectedValue(new Error("offline"));
    await expect(planOfferKpChatCommand("hello")).resolves.toBeNull();
  });
});
