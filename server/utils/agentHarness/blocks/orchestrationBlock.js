const { BaseBlock } = require("../BaseBlock");

/**
 * Observe → act loop hooks: logs turns and exposes cycle metadata to other blocks.
 */
class OrchestrationBlock extends BaseBlock {
  constructor() {
    super("orchestration");
  }

  async install(harness) {
    const aibitat = harness.aibitat;

    aibitat.onStart?.(() => {
      harness.state.set("cycle", "started");
      harness.log("orchestration cycle started");
    });

    aibitat.onMessage?.(async (message) => {
      await harness.runPipeline("turnEnd", { message });
      harness.state.set("lastMessageFrom", message?.from || null);
    });

    aibitat.onTerminate?.(() => {
      harness.state.set("cycle", "finished");
      harness.log("orchestration cycle finished", {
        turns: harness.state.get("turn") || 0,
      });
    });
  }

  async beforeTurn(params, harness) {
    harness.state.set("cycle", "acting");
    harness.log("observe-act step", {
      from: params.from,
      to: params.to,
      turn: (harness.state.get("turn") || 0) + 1,
    });
  }
}

module.exports = { OrchestrationBlock };
