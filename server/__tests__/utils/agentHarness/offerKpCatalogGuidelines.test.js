const {
  getOfferKpHarnessGuidelines,
  guidelinesForContext,
  OFFER_KP_MATCH_PRIORITIES,
} = require("../../../config/offerKp.harnessGuidelines");
const { OfferKpCatalogGuidelinesBlock } = require("../../../utils/agentHarness/blocks/offerKpCatalogGuidelinesBlock");
const { ContextManagerBlock } = require("../../../utils/agentHarness/blocks/contextManagerBlock");
const { AgentHarness } = require("../../../utils/agentHarness/AgentHarness");
const {
  registerHarnessBlock,
  listRegisteredBlocks,
  resolveOfferKpBlockIds,
} = require("../../../utils/agentHarness/registry");

describe("offerKp harness guidelines", () => {
  it("includes always-on catalog rules", () => {
    const lines = guidelinesForContext({ quoteDocument: false });
    expect(lines.some((l) => l.includes("Не копируй дословно"))).toBe(true);
    expect(lines.some((l) => l.includes("кг"))).toBe(true);
    expect(lines.some((l) => l.includes("косинус"))).toBe(true);
  });

  it("adds quote-specific rules when quote document", () => {
    const quote = guidelinesForContext({ quoteDocument: true });
    const plain = guidelinesForContext({ quoteDocument: false });
    expect(quote.length).toBeGreaterThan(plain.length);
    expect(quote.some((l) => l.includes("статус"))).toBe(true);
  });

  it("includes match priority hints", () => {
    const all = getOfferKpHarnessGuidelines({ quoteDocument: true });
    expect(all.some((l) => l.includes("DIN 931"))).toBe(true);
    expect(OFFER_KP_MATCH_PRIORITIES.some((p) => p.id === "gost-7798-bolt-din931")).toBe(
      true
    );
  });

  it("OfferKpCatalogGuidelinesBlock merges into context pipeline", async () => {
    const aibitat = {
      fetchParsedFileContext: jest.fn().mockResolvedValue("catalog data"),
    };
    const harness = new AgentHarness({ aibitat, ctx: {} });
    harness.use(new OfferKpCatalogGuidelinesBlock()).use(new ContextManagerBlock());
    await harness.install();

    const merged = await aibitat.fetchParsedFileContext();
    expect(merged).toContain("<harness_guidelines>");
    expect(merged).toContain("кг");
    expect(merged).toContain("DIN 931");
  });

  it("registry lists default OfferKP blocks including catalog-guidelines", () => {
    const ids = resolveOfferKpBlockIds();
    expect(ids).toContain("offerKp-catalog-guidelines");
    expect(listRegisteredBlocks()).toContain("offerKp-catalog-guidelines");
  });

  it("allows registering extra blocks via registry", () => {
    class DemoBlock {
      constructor() {
        this.name = "demo-extra";
      }
      async install() {}
    }
    registerHarnessBlock("demo-extra", () => new DemoBlock());
    expect(listRegisteredBlocks()).toContain("demo-extra");
  });
});
