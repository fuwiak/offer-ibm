const { offerKpLog } = require("../offerKpApp/offerKpLog");

/**
 * Structured harness logs — stdout попадает в Railway Logs.
 */
function harnessLog(level, event, meta = null) {
  offerKpLog(level, `[AgentHarness] ${event}`, meta);
}

module.exports = { harnessLog };
