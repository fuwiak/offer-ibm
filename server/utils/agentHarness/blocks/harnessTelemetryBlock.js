const { BaseBlock } = require("../BaseBlock");
const { harnessLog } = require("../harnessLog");

/**
 * Railway-visible telemetry for every harness lifecycle event.
 */
class HarnessTelemetryBlock extends BaseBlock {
  constructor() {
    super("harness-telemetry");
  }

  async install(harness) {
    harnessLog("info", "block.install", {
      block: this.name,
      sessionId: harness.state.get("sessionId") || null,
      workspaceId: harness.ctx.workspace?.id ?? null,
    });
  }

  async beforeTurn(params, harness) {
    harnessLog("info", "orchestration.beforeTurn", {
      from: params.from,
      to: params.to,
      turn: (harness.state.get("turn") || 0) + 1,
    });
  }

  async beforeToolApproval(params, harness) {
    harnessLog("info", "toolApproval.request", {
      skillName: params.skillName,
      filename: params.payload?.filename || null,
      quoteDocument: Boolean(harness.state.get("quoteDocumentRequest")),
    });
  }
}

module.exports = { HarnessTelemetryBlock };
