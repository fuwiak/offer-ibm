/**
 * Base class for agent harness blocks.
 * Extend and override lifecycle hooks; register via harness.use(block).
 */
class BaseBlock {
  /** @param {string} name */
  constructor(name) {
    this.name = name;
  }

  /** @param {import("./AgentHarness")} _harness */
  async install(_harness) {}

  /**
   * @param {object} _params
   * @param {import("./AgentHarness")} _harness
   * @returns {Promise<object|null|void>}
   */
  async beforeToolApproval(_params, _harness) {}

  /**
   * @param {{ baseContext?: string }} _params
   * @param {import("./AgentHarness")} _harness
   * @returns {Promise<{ context?: string }|null|void>}
   */
  async buildContext(_params, _harness) {}

  /**
   * @param {object} _params
   * @param {import("./AgentHarness")} _harness
   */
  async beforeTurn(_params, _harness) {}

  /**
   * @param {object} _params
   * @param {import("./AgentHarness")} _harness
   */
  async afterTurn(_params, _harness) {}
}

module.exports = { BaseBlock };
