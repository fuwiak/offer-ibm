const { AgentHarness } = require("../../../utils/agentHarness/AgentHarness");
const { BaseBlock } = require("../../../utils/agentHarness/BaseBlock");
const { OfferKpQuoteIntentBlock } = require("../../../utils/agentHarness/blocks/offerKpQuoteIntentBlock");
const { ToolRegistryBlock } = require("../../../utils/agentHarness/blocks/toolRegistryBlock");

describe("AgentHarness", () => {
  it("runs toolApproval pipeline and short-circuits on handled block", async () => {
    class AlwaysApproveBlock extends BaseBlock {
      constructor() {
        super("always-approve");
      }
      async beforeToolApproval() {
        return { handled: true, approved: true, message: "test ok" };
      }
    }

    const aibitat = { _chats: [] };
    const harness = new AgentHarness({ aibitat, ctx: {} });
    harness.use(new AlwaysApproveBlock());

    await harness.install();

    const result = await harness.resolveToolApproval({ skillName: "demo-tool" });
    expect(result).toEqual({ approved: true, message: "test ok" });
  });

  it("wraps requestToolApproval via ToolRegistryBlock", async () => {
    const originalApproval = jest.fn().mockResolvedValue({
      approved: false,
      message: "needs user",
    });
    const aibitat = {
      _chats: [{ from: "USER", content: "Подготовь коммерческое предложение" }],
      requestToolApproval: originalApproval,
    };

    const harness = new AgentHarness({ aibitat, ctx: { workspace: null } });
    harness.use(new OfferKpQuoteIntentBlock()).use(new ToolRegistryBlock());
    await harness.install();

    const result = await aibitat.requestToolApproval({
      skillName: "create-docx-file",
      payload: { title: "Коммерческое предложение", filename: "Kp_test.docx" },
    });

    expect(result.approved).toBe(true);
    expect(originalApproval).not.toHaveBeenCalled();
  });

  it("merges context layers in buildContext pipeline", async () => {
    class GuidelineBlock extends BaseBlock {
      constructor() {
        super("guidelines");
      }
      async install(harness) {
        harness.state.set("contextGuidelines", ["Use catalog prices only"]);
      }
    }

    const aibitat = {
      fetchParsedFileContext: jest.fn().mockResolvedValue("base docs"),
    };

    const { ContextManagerBlock } = require("../../../utils/agentHarness/blocks/contextManagerBlock");
    const harness = new AgentHarness({ aibitat, ctx: {} });
    harness.use(new GuidelineBlock()).use(new ContextManagerBlock());
    await harness.install();

    const merged = await aibitat.fetchParsedFileContext();
    expect(merged).toContain("base docs");
    expect(merged).toContain("Use catalog prices only");
  });
});
