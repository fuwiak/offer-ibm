const { BaseBlock } = require("./BaseBlock");
const { harnessLog } = require("./harnessLog");

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
    harnessLog("info", message, meta);
    const fn = this.ctx.log;
    if (typeof fn === "function") {
      fn(`[AgentHarness] ${message}`, meta);
    }
  }

  /**
   * Run a named pipeline across blocks.
   * @param {"toolApproval"|"context"|"turnStart"|"turnEnd"} kind
   * @param {object} payload
   */
  async runPipeline(kind, payload = {}) {
    const hookName = PIPELINE_HOOKS[kind];
    if (!hookName) return null;

    harnessLog("info", `pipeline.${kind}`, {
      skillName: payload.skillName || null,
      blockCount: this.blocks.length,
    });

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
    harnessLog("info", "harness.install.start", {
      blocks: this.blocks.map((b) => b.name),
      workspaceId: this.ctx.workspace?.id ?? null,
    });

    for (const block of this.blocks) {
      await block.install(this);
      this.log(`block installed: ${block.name}`);
    }
    this.aibitat.harness = this;
    this.state.set("installedAt", Date.now());

    harnessLog("info", "harness.install.done", {
      blocks: this.listBlocks(),
      sessionId: this.state.get("sessionId") || null,
    });
    return this;
  }
}

module.exports = { AgentHarness };
