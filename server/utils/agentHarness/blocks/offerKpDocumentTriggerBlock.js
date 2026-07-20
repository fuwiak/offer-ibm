const { BaseBlock } = require("../BaseBlock");
const { harnessLog } = require("../harnessLog");
const {
  isQuoteDocumentRequest,
  quoteDocumentAgentGuidelines,
} = require("../../offerKp/quoteRequestPhrases");
const { extractRecentUserMessages } = require("../../offerKp/quoteIntentJudge");
const {
  layerGuidelines,
  ABSTAIN_MESSAGE,
} = require("../../../config/offerKp.harnessAntiHallucination");
const {
  hasPdfInquiryEvidence,
  ensurePdfInquiryEvidence,
} = require("../../offerKp/harnessEvidence");

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
    const inquiryLines = harness.state.get("inquiryLineCount") || 0;
    const maxInquiryBlocks = Math.max(
      1,
      Math.min(500, parseInt(process.env.OFFER_KP_INQUIRY_MAX_LINES, 10) || 200)
    );
    harness.state.set(
      "catalogMaxDocs",
      inquiryLines > 1
        ? Math.min(maxInquiryBlocks, Math.max(8, inquiryLines))
        : 8
    );
    harness.state.set(
      "contextGuidelines",
      [
        ...quoteDocumentAgentGuidelines(),
        ...layerGuidelines("constrain"),
        "Количество по каждой позиции бери из прикреплённого PDF-файла в контексте; цену — из [Каталог · purolat.com]. Не ставь 0 в колонке «Кол-во», если в заявке указано число.",
        inquiryLines > 1
          ? `В заявке ${inquiryLines} позиций — в КП, DOCX и PDF должно быть ровно ${inquiryLines} строк (по одной на каждую строку черновика и блок каталога). Вызови quote-calculator для каждой строки.`
          : null,
      ].filter(Boolean)
    );

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

    await ensurePdfInquiryEvidence(harness);

    try {
      const {
        loadParsedFileTextsForThread,
      } = require("../../offerKp/catalogPrompt");
      const { parseInquiryText } = require("../../offerKp/parseInquiry");
      const parsedFileTexts = await loadParsedFileTextsForThread({
        workspace: harness.ctx.workspace,
        threadId: harness.ctx.invocation?.thread_id ?? null,
        userId: harness.ctx.invocation?.user_id ?? null,
      });
      const inquiryLineCount = parseInquiryText(
        [prompt, ...parsedFileTexts].filter(Boolean).join("\n\n")
      ).length;
      if (inquiryLineCount > 0) {
        harness.state.set("inquiryLineCount", inquiryLineCount);
      }
    } catch {
      /* non-fatal */
    }
  }

  async beforeToolApproval(params, harness) {
    if (!harness.state.get("quoteDocumentRequest")) return null;

    const docSkills = new Set(["create-docx-file", "create-pdf-file"]);
    if (!docSkills.has(params.skillName)) return null;

    await ensurePdfInquiryEvidence(harness);

    if (
      harness.state.get("catalogEvidenceThin") &&
      !hasPdfInquiryEvidence(harness)
    ) {
      harnessLog("warn", "quoteDocument.abstainThinEvidence", {
        skillName: params.skillName,
        evidenceGrade: harness.state.get("evidenceGrade"),
      });
      return {
        handled: true,
        approved: false,
        message: `Каталог недостаточен для КП. ${ABSTAIN_MESSAGE}`,
      };
    }

    return null;
  }
}

module.exports = { OfferKpDocumentTriggerBlock };
