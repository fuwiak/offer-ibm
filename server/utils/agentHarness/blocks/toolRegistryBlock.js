const chalk = require("chalk");
const { BaseBlock } = require("../BaseBlock");
const { skillIsAutoApproved } = require("../../helpers/agents");

/**
 * Tool registry gate: ENV auto-approve + harness pipeline before user prompt.
 * Install last so it wraps aibitat.requestToolApproval from transport plugins.
 */
class ToolRegistryBlock extends BaseBlock {
  constructor() {
    super("tool-registry");
  }

  async install(harness) {
    const aibitat = harness.aibitat;
    const previous = aibitat.requestToolApproval;
    if (typeof previous !== "function") {
      harness.log("tool-registry: requestToolApproval not found, skipping wrap");
      return;
    }

    aibitat.requestToolApproval = async (params) => {
      if (skillIsAutoApproved({ skillName: params.skillName })) {
        return {
          approved: true,
          message: "Skill is auto-approved.",
        };
      }

      const harnessDecision = await harness.resolveToolApproval(params);
      if (harnessDecision) {
        console.log(
          chalk.green(
            `Skill ${params.skillName} approved by harness (${harnessDecision.message})`
          )
        );
        return harnessDecision;
      }

      return previous.call(aibitat, params);
    };
  }
}

module.exports = { ToolRegistryBlock };
