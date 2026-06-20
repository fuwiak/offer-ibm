const { BaseBlock } = require("../BaseBlock");

/**
 * Session memory: shared key/value state and turn metadata for long-running jobs.
 */
class MemoryBlock extends BaseBlock {
  constructor() {
    super("memory");
  }

  async install(harness) {
    const invocation = harness.ctx.invocation;
    harness.state.set("sessionId", invocation?.uuid || `session-${Date.now()}`);
    harness.state.set("turn", 0);
    harness.state.set("preferences", {});

    const aibitat = harness.aibitat;
    aibitat.onTerminate?.(() => {
      harness.state.set("finishedAt", Date.now());
    });
  }

  async afterTurn(_params, harness) {
    const turn = (harness.state.get("turn") || 0) + 1;
    harness.state.set("turn", turn);
  }
}

module.exports = { MemoryBlock };
