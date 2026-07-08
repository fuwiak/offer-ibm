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
const {
  collectCatalogBlocksFromHarness,
  validateQuotePricesAgainstCatalog,
} = require("../../offerKp/harnessEvidence");
const { validateQuotePricesFromDb } = require("../../offerKp/quoteDbPriceGate");
const { layerGuidelines } = require("../../../config/offerKp.harnessAntiHallucination");

/**
 * Проверяет обязательные требования КП перед create-docx/pdf.
 * Нарушения блокируют генерацию документа и возвращают агенту список правок.
 */
class OfferKpQuoteComplianceBlock extends BaseBlock {
  constructor() {
    super("offerKp-quote-compliance");
  }

  async install(harness) {
    const guidelines = [
      ...mandatoryRequirementsGuidelines(),
      ...layerGuidelines("verify"),
      ...layerGuidelines("abstain"),
    ];
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

    const catalogBlocks = collectCatalogBlocksFromHarness(harness);
    const inquiryDbDraft = harness.state.get("inquiryDbDraft") || null;
    const dbPriceCheck = validateQuotePricesFromDb(content, {
      draft: inquiryDbDraft,
      catalogBlocks,
    });
    const catalogCheck = validateQuotePricesAgainstCatalog(content, catalogBlocks);
    const violations = [
      ...result.violations,
      ...dbPriceCheck.violations,
      ...catalogCheck.violations,
    ];

    const complianceOk =
      result.ok && dbPriceCheck.ok && catalogCheck.ok;

    if (complianceOk) {
      harness.state.set("quoteComplianceOk", true);
      harness.state.delete("quoteComplianceViolations");
      return null;
    }

    harness.state.set("quoteComplianceOk", false);
    harness.state.set("quoteComplianceViolations", violations);

    const details = formatComplianceRejection(violations);
    harnessLog("warn", "quoteCompliance.rejected", {
      skillName: params.skillName,
      violationIds: violations.map((v) => v.id),
    });
    harness.log("quote compliance rejected", {
      skillName: params.skillName,
      violations: violations.map((v) => v.id),
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
