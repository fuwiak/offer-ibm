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
const {
  OFFER_KP_INTENTS,
  routeOfferKpMessage,
} = require("../../offerKp/intentRouter");
const {
  classifyAmbiguousIntentWithLlm,
} = require("../../offerKp/intentLlmJudge");

const QUOTE_FORBIDDEN_RETRIEVAL_TOOLS = new Set([
  "rag-memory",
  "web-scraping",
  "web-browsing",
  "document-summarizer",
]);

function toolName(entry) {
  return typeof entry === "string" ? entry : String(entry?.name || "");
}

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
    const pdfEvidence = await ensurePdfInquiryEvidence(harness);
    let triggersDoc = isQuoteDocumentRequest(prompt);

    // The deterministic router has an explicit "ambiguous" bucket for
    // messages none of its rules matched confidently. Rather than silently
    // falling back to a guess in either direction, ask a cheap LLM judge to
    // break the tie — but only in that narrow, already-rare case, so this
    // never adds latency to the confidently-classified majority of turns.
    if (!triggersDoc && !pdfEvidence) {
      const routed = routeOfferKpMessage(prompt);
      if (routed.primaryIntent === OFFER_KP_INTENTS.AMBIGUOUS) {
        const judged = await classifyAmbiguousIntentWithLlm(prompt, {
          workspace: harness.ctx?.workspace,
        });
        harnessLog("info", "quoteDocument.ambiguousIntentJudge", {
          judged,
          prompt: prompt.slice(0, 120),
        });
        if (
          judged === OFFER_KP_INTENTS.CREATE_QUOTE ||
          judged === OFFER_KP_INTENTS.EDIT_QUOTE
        ) {
          triggersDoc = true;
        }
      }
    }

    // A phrase match on the message text isn't the only valid trigger: an
    // attached PDF that already reads as a priced inquiry must also switch
    // the agent into ShopDB-only mode, otherwise a bare "here's the file"
    // message silently keeps rag-memory/web-scraping tools available.
    if (!triggersDoc && !pdfEvidence) {
      return;
    }

    harness.state.set("quoteDocumentRequest", true);

    // Эти универсальные инструменты регистрируются по умолчанию для обычного
    // агента, но в КП допустимы только заявка и ShopDB. Удаляем их до первого
    // model turn, чтобы модель даже не пыталась вызвать scraping/RAG.
    const agent = harness.aibitat?.agents?.get?.("@agent");
    if (agent?.functions) {
      const before = agent.functions.length;
      agent.functions = agent.functions.filter(
        (entry) => !QUOTE_FORBIDDEN_RETRIEVAL_TOOLS.has(toolName(entry))
      );
      harnessLog("info", "quoteDocument.retrievalToolsRemoved", {
        removed: before - agent.functions.length,
      });
    }
    // Also drop handlers so a stale function Map cannot still execute tools.
    if (harness.aibitat?.functions?.delete) {
      for (const name of QUOTE_FORBIDDEN_RETRIEVAL_TOOLS) {
        harness.aibitat.functions.delete(name);
      }
    }
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
      introspect("@agent: Analyzing and verifying the source document…");
    }

    harness.log("quote document request detected — source verification first", {
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

    if (QUOTE_FORBIDDEN_RETRIEVAL_TOOLS.has(params.skillName)) {
      return {
        handled: true,
        approved: false,
        message:
          "Инструмент запрещён для КП: используй только приложенную заявку и ShopDB.",
      };
    }

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

module.exports = {
  OfferKpDocumentTriggerBlock,
  QUOTE_FORBIDDEN_RETRIEVAL_TOOLS,
};
