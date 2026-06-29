const { BaseBlock } = require("../BaseBlock");
const { harnessLog } = require("../harnessLog");
const {
  mandatoryRequirementsGuidelines,
} = require("../../../config/offerKp.quoteRequirements");
const {
  checkQuoteCompliance,
  formatComplianceRejection,
  isQuoteDocSkill,
} = require("../../offerKp/quoteComplianceChecker");

/**
 * Проверяет обязательные требования КП перед create-docx/pdf.
 * Нарушения блокируют генерацию документа и возвращают агенту список правок.
 */
class OfferKpQuoteComplianceBlock extends BaseBlock {
  constructor() {
    super("offerKp-quote-compliance");
  }

  async install(harness) {
    const guidelines = mandatoryRequirementsGuidelines();
    const existing = harness.state.get("contextGuidelines") || [];
    harness.state.set("contextGuidelines", [...existing, ...guidelines]);
    harness.state.set("quoteMandatoryRequirements", guidelines);
    harness.log("quote compliance checker installed", {
      rules: guidelines.length,
    });
  }

  async beforeToolApproval(params, harness) {
    if (!isQuoteDocSkill(params.skillName)) return null;
    if (!harness.state.get("quoteDocumentRequest")) return null;

    const content = String(params.payload?.content || "").trim();
    const result = checkQuoteCompliance({
      content,
      skillName: params.skillName,
    });

    if (result.ok) {
      harness.state.set("quoteComplianceOk", true);
      harness.state.delete("quoteComplianceViolations");
      return null;
    }

    harness.state.set("quoteComplianceOk", false);
    harness.state.set("quoteComplianceViolations", result.violations);

    const details = formatComplianceRejection(result.violations);
    harnessLog("warn", "quoteCompliance.rejected", {
      skillName: params.skillName,
      violationIds: result.violations.map((v) => v.id),
    });
    harness.log("quote compliance rejected", {
      skillName: params.skillName,
      violations: result.violations.map((v) => v.id),
    });

    return {
      handled: true,
      approved: false,
      message:
        `КП не прошло обязательную проверку harness. Исправь нарушения и пересоздай документ:\n${details}`,
    };
  }
}

module.exports = { OfferKpQuoteComplianceBlock };
