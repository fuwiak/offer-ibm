const { BaseBlock } = require("./BaseBlock");

const PIPELINE_HOOKS = {
  toolApproval: "beforeToolApproval",
  context: "buildContext",
  turnStart: "beforeTurn",
  turnEnd: "afterTurn",
};

/**
 * Composable harness around AIbitat: blocks add tools policy, context, memory, orchestration.
 */
class AgentHarness {
  /**
   * @param {{ aibitat: object, ctx?: object }} options
   */
  constructor({ aibitat, ctx = {} }) {
    this.aibitat = aibitat;
    this.ctx = ctx;
    /** @type {BaseBlock[]} */
    this.blocks = [];
    /** @type {Map<string, unknown>} */
    this.state = new Map();
  }

  /** @param {BaseBlock} block */
  use(block) {
    if (!(block instanceof BaseBlock)) {
      throw new TypeError("AgentHarness.use() expects a BaseBlock instance");
    }
    this.blocks.push(block);
    return this;
  }

  listBlocks() {
    return this.blocks.map((b) => b.name);
  }

  log(message, meta = null) {
    const fn = this.ctx.log;
    if (typeof fn === "function") {
      fn(`[AgentHarness] ${message}`, meta);
      return;
    }
    console.log(`[AgentHarness] ${message}`, meta || "");
  }

  /**
   * Run a named pipeline across blocks.
   * @param {"toolApproval"|"context"|"turnStart"|"turnEnd"} kind
   * @param {object} payload
   */
  async runPipeline(kind, payload = {}) {
    const hookName = PIPELINE_HOOKS[kind];
    if (!hookName) return null;

    if (kind === "context") {
      let baseContext = payload.baseContext ?? "";
      for (const block of this.blocks) {
        const fn = block[hookName];
        if (typeof fn !== "function") continue;
        const result = await fn({ baseContext }, this);
        if (result?.context !== undefined) {
          baseContext = result.context;
        }
      }
      return baseContext;
    }

    for (const block of this.blocks) {
      const fn = block[hookName];
      if (typeof fn !== "function") continue;
      const result = await fn(payload, this);
      if (kind === "toolApproval" && result?.handled) {
        return result;
      }
    }
    return null;
  }

  async resolveToolApproval(params) {
    const decision = await this.runPipeline("toolApproval", params);
    if (!decision?.handled) return null;
    return {
      approved: Boolean(decision.approved),
      message: decision.message || "Handled by agent harness.",
    };
  }

  async install() {
    for (const block of this.blocks) {
      await block.install(this);
      this.log(`block installed: ${block.name}`);
    }
    this.aibitat.harness = this;
    this.state.set("installedAt", Date.now());
    return this;
  }
}

module.exports = { AgentHarness };
