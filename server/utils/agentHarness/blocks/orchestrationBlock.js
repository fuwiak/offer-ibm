const { BaseBlock } = require("../BaseBlock");
const { parseThresholdsFromEnv } = require("../../../config/offerKp.harnessAntiHallucination");

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
      evidenceGrade: harness.state.get("evidenceGrade"),
      cragHops: harness.state.get("cragHops") || 0,
    });
  }

  async afterTurn(params, harness) {
    const thresholds = harness.state.get("antiHallucinationThresholds") || parseThresholdsFromEnv();
    const grade = harness.state.get("evidenceGrade");
    const hops = harness.state.get("cragHops") || 0;

    if (
      grade != null &&
      grade < thresholds.cragOk &&
      grade >= thresholds.cragBad &&
      hops < thresholds.maxCragHops
    ) {
      harness.state.set("cragNeedsRefine", true);
    } else {
      harness.state.delete("cragNeedsRefine");
    }
  }
}

module.exports = { OrchestrationBlock };
