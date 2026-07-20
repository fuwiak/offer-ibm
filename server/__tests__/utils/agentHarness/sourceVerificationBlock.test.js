/* eslint-env jest, node */

const { AgentHarness } = require("../../../utils/agentHarness/AgentHarness");
const {
  OfferKpSourceVerificationBlock,
  VERIFY_TOOL_NAME,
} = require("../../../utils/agentHarness/blocks/offerKpSourceVerificationBlock");
const {
  WorkspaceParsedFiles,
} = require("../../../models/workspaceParsedFiles");
const {
  createRegisteredBlock,
} = require("../../../utils/agentHarness/registry");

function sourceText(count = 20) {
  return [
    "Заявка на поставку болтов",
    "№\tНаименование товара\tЕд. изм.\tКоличество",
    ...Array.from(
      { length: count },
      (_, index) =>
        `${index + 1}\tБолт ГОСТ 7805-70 М${index + 6}х${index + 20}\tкг\t${index + 1}`
    ),
  ].join("\n");
}

describe("OfferKpSourceVerificationBlock", () => {
  afterEach(() => jest.restoreAllMocks());

  it("loads inquiry-quality and source-verification blocks from the registry", () => {
    expect(
      createRegisteredBlock("offerKp-inquiry-quality").constructor.name
    ).toBe("OfferKpInquiryQualityBlock");
    expect(
      createRegisteredBlock("offerKp-source-verification").constructor.name
    ).toBe("OfferKpSourceVerificationBlock");
  });

  it("blocks documents until verification, then delegates content to ShopDB compliance", async () => {
    jest
      .spyOn(WorkspaceParsedFiles, "getContextFiles")
      .mockResolvedValue([
        { title: "request.pdf-1", pageContent: sourceText() },
      ]);
    let verifyTool;
    const agent = { functions: [] };
    const aibitat = {
      _chats: [],
      agents: new Map([["@agent", agent]]),
      function: jest.fn((definition) => {
        if (definition.name === VERIFY_TOOL_NAME) verifyTool = definition;
      }),
    };
    const harness = new AgentHarness({
      aibitat,
      ctx: {
        workspace: { id: 7 },
        invocation: { thread_id: 11, user_id: 3 },
      },
    });
    harness.state.set("quoteDocumentRequest", true);
    harness.use(new OfferKpSourceVerificationBlock());
    await harness.install();

    expect(harness.state.get("quoteSourceLocked")).toBe(true);
    expect(harness.state.get("strictSourceOnly")).toBeUndefined();
    expect(agent.functions).toContain(VERIFY_TOOL_NAME);

    const blocked = await harness.resolveToolApproval({
      skillName: "create-docx-file",
      payload: { filename: "quote.docx", content: "invented" },
    });
    expect(blocked).toMatchObject({ approved: false });
    expect(blocked.message).toContain(VERIFY_TOOL_NAME);

    const analysis = harness.state.get("quoteSourceAnalysis");
    const declaration = {
      source_verified: true,
      items_expected: 20,
      items_extracted: 20,
      prices_present: false,
      ready_to_generate: true,
      items: analysis.items.map(({ number, name, unit, quantity }) => ({
        number,
        name,
        unit,
        quantity,
      })),
    };
    const verification = JSON.parse(await verifyTool.handler(declaration));
    expect(verification.ok).toBe(true);

    const payload = { filename: "quote.docx", content: "invented" };
    const allowed = await harness.resolveToolApproval({
      skillName: "create-docx-file",
      payload,
    });
    expect(allowed).toBeNull();
    expect(payload.content).toBe("invented");
  });

  it("allows quote-calculator because confirmed prices come from ShopDB", async () => {
    jest
      .spyOn(WorkspaceParsedFiles, "getContextFiles")
      .mockResolvedValue([
        { title: "request.pdf-1", pageContent: sourceText(2) },
      ]);
    const aibitat = {
      agents: new Map(),
      function: jest.fn(),
    };
    const harness = new AgentHarness({
      aibitat,
      ctx: { workspace: { id: 7 }, invocation: {} },
    });
    harness.state.set("quoteDocumentRequest", true);
    harness.use(new OfferKpSourceVerificationBlock());
    await harness.install();

    const result = await harness.resolveToolApproval({
      skillName: "quote-calculator",
      payload: { quantity: 2, unitPrice: 18.5 },
    });
    expect(result).toBeNull();
  });
});
