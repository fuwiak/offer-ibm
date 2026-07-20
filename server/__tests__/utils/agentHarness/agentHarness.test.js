const { AgentHarness } = require("../../../utils/agentHarness/AgentHarness");
const { BaseBlock } = require("../../../utils/agentHarness/BaseBlock");
const { OfferKpDocumentTriggerBlock } = require("../../../utils/agentHarness/blocks/offerKpDocumentTriggerBlock");
const { OfferKpQuoteIntentBlock } = require("../../../utils/agentHarness/blocks/offerKpQuoteIntentBlock");
const { ToolRegistryBlock } = require("../../../utils/agentHarness/blocks/toolRegistryBlock");
const {
  OfferKpQuoteComplianceBlock,
} = require("../../../utils/agentHarness/blocks/offerKpQuoteComplianceBlock");

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

  it("auto-approves docx/pdf when quote document trigger is active", async () => {
    const aibitat = {
      _chats: [{ from: "USER", content: "сделай кп" }],
      introspect: jest.fn(),
      requestToolApproval: jest.fn(),
    };

    const harness = new AgentHarness({
      aibitat,
      ctx: { invocation: { prompt: "сделай кп" }, workspace: null },
    });
    harness
      .use(new OfferKpDocumentTriggerBlock())
      .use(new OfferKpQuoteIntentBlock())
      .use(new ToolRegistryBlock());
    await harness.install();

    expect(harness.state.get("quoteDocumentRequest")).toBe(true);
    expect(aibitat.introspect).toHaveBeenCalledWith(
      "@agent: Creating Word document…"
    );

    const pdf = await harness.resolveToolApproval({
      skillName: "create-pdf-file",
      payload: { filename: "Kp_test.pdf" },
    });
    expect(pdf?.approved).toBe(true);
  });

  it("rejects invalid КП content via compliance checker before doc generation", async () => {
    const aibitat = {
      _chats: [{ from: "USER", content: "сделай кп" }],
      introspect: jest.fn(),
      requestToolApproval: jest.fn(),
    };

    const harness = new AgentHarness({
      aibitat,
      ctx: { invocation: { prompt: "сделай кп" }, workspace: null },
    });
    harness
      .use(new OfferKpDocumentTriggerBlock())
      .use(new OfferKpQuoteComplianceBlock())
      .use(new OfferKpQuoteIntentBlock())
      .use(new ToolRegistryBlock());
    await harness.install();

    // Нет колонок цены/суммы — sanitize не спасёт, compliance должен заблокировать.
    const rejected = await harness.resolveToolApproval({
      skillName: "create-docx-file",
      payload: {
        filename: "Kp_test.docx",
        content:
          "| Позиция | Кол-во |\n| --- | --- |\n| Болт | 40 |",
      },
    });

    expect(rejected?.approved).toBe(false);
    expect(rejected?.message).toMatch(/проверку harness/i);
    expect(harness.state.get("quoteComplianceOk")).toBe(false);
  });

  it("forces create-docx content from inquiryDbDraft (ignores agent 18.50 spam)", async () => {
    const aibitat = {
      _chats: [{ from: "USER", content: "сделай кп" }],
      introspect: jest.fn(),
      requestToolApproval: jest.fn(),
    };

    const harness = new AgentHarness({
      aibitat,
      ctx: { invocation: { prompt: "сделай кп" }, workspace: null },
    });
    harness
      .use(new OfferKpDocumentTriggerBlock())
      .use(new OfferKpQuoteComplianceBlock())
      .use(new OfferKpQuoteIntentBlock())
      .use(new ToolRegistryBlock());
    await harness.install();

    harness.state.set("inquiryDbDraft", {
      reference: "KP-FORCE",
      lines: [
        {
          requestedName: "Болт M10x100",
          name: "Болт DIN 931 M10x100",
          quantity: 30,
          unit: "кг",
          unitPriceNet: 45,
          lineTotal: 1620,
          status: "В наличии",
          matchType: "exact",
        },
        {
          requestedName: "Болт M6x25",
          name: "Болт M6x25",
          quantity: 3,
          unit: "кг",
          unitPriceNet: 0,
          lineTotal: 0,
          status: "под заказ",
          matchType: "none",
        },
      ],
    });

    const payload = {
      filename: "Kp_spam.docx",
      content:
        "| № | Наименование | Кол-во | Цена | Сумма |\n|---|---|---|---|---|\n| 1 | Болт | 30 | 18.50 | 555 |\n| 2 | Болт | 3 | 18.50 | 55.50 |",
    };

    const approved = await harness.resolveToolApproval({
      skillName: "create-docx-file",
      payload,
    });

    expect(approved?.approved).toBe(true);
    expect(payload.content).toContain("45.00");
    expect(payload.content).toContain("1350.00");
    expect(payload.content).toMatch(/\| 2 \|[^|]+\| 3 \| кг \| — \|/);
    expect(payload.content).not.toContain("18.50");
    expect(harness.state.get("quoteComplianceOk")).toBe(true);
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
