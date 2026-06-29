const chalk = require("chalk");
const { BaseBlock } = require("../BaseBlock");
const { skillIsAutoApproved } = require("../../helpers/agents");
const { isQuoteDocSkill } = require("../../offerKp/quoteComplianceChecker");

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
      harness.log(
        "tool-registry: requestToolApproval not found, skipping wrap"
      );
      return;
    }

    aibitat.requestToolApproval = async (params) => {
      if (skillIsAutoApproved({ skillName: params.skillName })) {
        return {
          approved: true,
          message: "Skill is auto-approved.",
        };
      }

      if (
        isQuoteDocSkill(params.skillName) &&
        harness.state.get("quoteComplianceOk") === false
      ) {
        const violations = harness.state.get("quoteComplianceViolations") || [];
        return {
          approved: false,
          message:
            "Документ КП заблокирован harness до исправления нарушений проверки." +
            (violations.length
              ? ` (${violations.map((v) => v.id).join(", ")})`
              : ""),
        };
      }

      const harnessDecision = await harness.resolveToolApproval(params);
      if (harnessDecision) {
        const approved = Boolean(harnessDecision.approved);
        console.log(
          chalk[approved ? "green" : "yellow"](
            `Skill ${params.skillName} ${approved ? "approved" : "rejected"} by harness (${harnessDecision.message})`
          )
        );
        return harnessDecision;
      }

      return previous.call(aibitat, params);
    };
  }
}

module.exports = { ToolRegistryBlock };
