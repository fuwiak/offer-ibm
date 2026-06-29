const { BaseBlock } = require("../BaseBlock");
const { harnessLog } = require("../harnessLog");
const {
  isQuoteDocumentRequest,
  quoteDocumentAgentGuidelines,
} = require("../../offerKp/quoteRequestPhrases");
const { extractRecentUserMessages } = require("../../offerKp/quoteIntentJudge");

/**
 * При фразах «сделай КП» — направляет @agent на Word + PDF и показывает статус в чате.
 */
class OfferKpDocumentTriggerBlock extends BaseBlock {
  constructor() {
    super("offerKp-document-trigger");
  }

  #resolvePrompt(harness) {
    const fromInvocation = harness.ctx.invocation?.prompt;
    if (fromInvocation && isQuoteDocumentRequest(fromInvocation)) {
      return String(fromInvocation).trim();
    }
    const fromChats = extractRecentUserMessages(harness.aibitat._chats, 3);
    return (
      fromChats.find((m) => isQuoteDocumentRequest(m)) || fromChats.at(-1) || ""
    );
  }

  async install(harness) {
    const prompt = this.#resolvePrompt(harness);
    if (!isQuoteDocumentRequest(prompt)) return;

    harness.state.set("quoteDocumentRequest", true);
    harness.state.set("contextGuidelines", quoteDocumentAgentGuidelines());

    harnessLog("info", "quoteDocument.trigger", {
      prompt: prompt.slice(0, 160),
      action: "agent-create-docx-pdf",
    });

    const introspect = harness.aibitat.introspect;
    if (typeof introspect === "function") {
      introspect("@agent: Creating Word document…");
      introspect("@agent: Creating PDF document…");
    }

    harness.log("quote document request detected — Word + PDF", {
      prompt: prompt.slice(0, 80),
    });
  }
}

module.exports = { OfferKpDocumentTriggerBlock };
