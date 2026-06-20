const { BaseBlock } = require("../BaseBlock");
const {
  extractRecentUserMessages,
  shouldAutoApproveQuoteFileSkill,
} = require("../../offerKp/quoteIntentJudge");

/**
 * OfferKP: auto-approve create-docx/pdf/text when user intent is commercial quote (КП).
 */
class OfferKpQuoteIntentBlock extends BaseBlock {
  constructor() {
    super("offerKp-quote-intent");
  }

  async beforeToolApproval(params, harness) {
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

    harness.log(`auto-approved tool ${params.skillName} for КП intent`);
    return {
      handled: true,
      approved: true,
      message: "Quote document intent - auto-approved.",
    };
  }
}

module.exports = { OfferKpQuoteIntentBlock };
