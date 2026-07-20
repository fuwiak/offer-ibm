/* eslint-env jest, node */

const { AgentHarness } = require("../../../utils/agentHarness/AgentHarness");
const { BaseBlock } = require("../../../utils/agentHarness/BaseBlock");

/**
 * Регрессия: runPipeline должен вызывать хуки с this === block.
 * Раньше `const fn = block[hook]; fn(payload, harness)` терял receiver и
 * блоки с приватными методами падали:
 * "Cannot read properties of undefined (reading 'OfferKpInquiryQualityBlock')".
 */
class PrivateMethodBlock extends BaseBlock {
  constructor() {
    super("private-method-block");
    this.evaluated = false;
  }

  async #evaluate() {
    this.evaluated = true;
    return "ok";
  }

  async install() {}

  async beforeToolApproval(params) {
    // this должен быть блоком — иначе TypeError на приватном методе.
    const result = await this.#evaluate();
    return {
      handled: true,
      approved: result === "ok",
      message: `evaluated=${this.evaluated}, skill=${params.skillName}`,
    };
  }

  async buildContext({ baseContext }) {
    await this.#evaluate();
    return { context: `${baseContext}+private` };
  }
}

describe("AgentHarness hook binding", () => {
  it("beforeToolApproval keeps this === block (private methods work)", async () => {
    const harness = new AgentHarness({ aibitat: {}, ctx: {} });
    const block = new PrivateMethodBlock();
    harness.use(block);

    const decision = await harness.resolveToolApproval({
      skillName: "create-docx-file",
      payload: {},
    });

    expect(decision).toEqual({
      approved: true,
      message: "evaluated=true, skill=create-docx-file",
    });
    expect(block.evaluated).toBe(true);
  });

  it("context pipeline keeps this === block", async () => {
    const harness = new AgentHarness({ aibitat: {}, ctx: {} });
    harness.use(new PrivateMethodBlock());

    const context = await harness.runPipeline("context", {
      baseContext: "base",
    });

    expect(context).toBe("base+private");
  });
});
