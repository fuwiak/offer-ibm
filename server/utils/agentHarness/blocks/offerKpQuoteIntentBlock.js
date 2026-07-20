const { BaseBlock } = require("../BaseBlock");
const {
  extractRecentUserMessages,
  shouldAutoApproveQuoteFileSkill,
} = require("../../offerKp/quoteIntentJudge");
const {
  parseThresholdsFromEnv,
} = require("../../../config/offerKp.harnessAntiHallucination");
const { hasPdfInquiryEvidence } = require("../../offerKp/harnessEvidence");

/**
 * OfferKP: auto-approve create-docx/pdf/text when user intent is commercial quote (КП).
 */
class OfferKpQuoteIntentBlock extends BaseBlock {
  constructor() {
    super("offerKp-quote-intent");
  }

  async beforeToolApproval(params, harness) {
    const docSkills = new Set(["create-docx-file", "create-pdf-file"]);
    const pdfInquiry = hasPdfInquiryEvidence(harness);
    if (
      docSkills.has(params.skillName) &&
      harness.state.get("catalogEvidenceThin") &&
      !pdfInquiry
    ) {
      return null;
    }

    const grade = harness.state.get("evidenceGrade");
    const thresholds =
      harness.state.get("antiHallucinationThresholds") ||
      parseThresholdsFromEnv();
    if (
      docSkills.has(params.skillName) &&
      !pdfInquiry &&
      grade != null &&
      grade < thresholds.cragBad
    ) {
      return null;
    }

    const userMessages = extractRecentUserMessages(harness.aibitat._chats);
    const workspace =
      harness.ctx.workspace ??
      harness.aibitat.handlerProps?.invocation?.workspace ??
      null;

    const approved = await shouldAutoApproveQuoteFileSkill({
      skillName: params.skillName,
      payload: params.payload,
      userMessages,
      workspace,
    });

    if (!approved) return null;

    if (params.skillName === "quote-calculator") {
      return {
        handled: true,
        approved: true,
        message: "Quote calculator - auto-approved.",
      };
    }

    harness.log(`auto-approved tool ${params.skillName} for КП intent`);
    return {
      handled: true,
      approved: true,
      message: "Quote document intent - auto-approved.",
    };
  }
}

module.exports = { OfferKpQuoteIntentBlock };
