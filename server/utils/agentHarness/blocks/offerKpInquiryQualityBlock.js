const { BaseBlock } = require("../BaseBlock");
const { harnessLog } = require("../harnessLog");
const { parseInquiryText } = require("../../offerKp/parseInquiry");
const {
  assessInquiryTextQuality,
  validateInquiryLines,
} = require("../../offerKp/inquiryTextQuality");
const { isQuoteDocSkill } = require("../../offerKp/quoteComplianceChecker");
const { layerGuidelines } = require("../../../config/offerKp.harnessAntiHallucination");

async function loadParsedTexts(harness) {
  const workspace = harness?.ctx?.workspace;
  const invocation = harness?.ctx?.invocation;
  if (!workspace?.id) return [];

  try {
    const { WorkspaceParsedFiles } = require("../../../models/workspaceParsedFiles");
    const threadId = invocation?.thread_id || null;
    const userId = invocation?.user_id || null;
    const files = await WorkspaceParsedFiles.getContextFiles(
      workspace,
      threadId ? { id: threadId } : null,
      userId ? { id: userId } : null
    );
    return (files || []).map((doc) => doc.pageContent).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Проверяет качество OCR-текста заявки и что кол-во не спутано с ценой.
 */
class OfferKpInquiryQualityBlock extends BaseBlock {
  constructor() {
    super("offerKp-inquiry-quality");
  }

  async #evaluate(harness) {
    const texts = await loadParsedTexts(harness);
    const combined = texts.join("\n\n");
    const textQuality = assessInquiryTextQuality(combined);
    const lines = parseInquiryText(combined);
    const lineIssues = validateInquiryLines(lines);

    harness.state.set("inquiryTextQuality", textQuality);
    harness.state.set("inquiryLineCount", lines.length);
    harness.state.set("inquiryLineIssues", lineIssues);
    harness.state.set(
      "inquiryQualityOk",
      textQuality.ok && lineIssues.length === 0
    );

    return { textQuality, lines, lineIssues, combined };
  }

  async install(harness) {
    const { textQuality, lineIssues, lines } = await this.#evaluate(harness);

    const guidelines = [...layerGuidelines("verify")];
    if (!textQuality.ok) {
      guidelines.push(
        "Текст PDF/заявки повреждён OCR (смешанная латиница/кириллица). Не выдумывай позиции — опирайся на блоки [Каталог · purolat.com] и черновик КП."
      );
    }
    if (lineIssues.length) {
      guidelines.push(
        "Возможна путаница кол-во/цена в OCR. Кол-во — из колонки «Кол-во» (кг/шт); цены — только из каталога ShopDB, не из PDF."
      );
    }
    if (lines.length > 1) {
      guidelines.push(
        `В заявке ${lines.length} позиций — в КП должно быть ровно ${lines.length} строк с корректным кол-вом.`
      );
    }

    const existing = harness.state.get("contextGuidelines") || [];
    harness.state.set("contextGuidelines", [...existing, ...guidelines]);

    harnessLog("info", "inquiryQuality.assessed", {
      ok: harness.state.get("inquiryQualityOk"),
      reason: textQuality.reason,
      lines: lines.length,
      issues: lineIssues.map((i) => i.id),
    });
  }

  async beforeToolApproval(params, harness) {
    if (!isQuoteDocSkill(params.skillName)) return null;
    if (!harness.state.get("quoteDocumentRequest")) return null;

    await this.#evaluate(harness);

    if (harness.state.get("inquiryQualityOk")) return null;

    const textQuality = harness.state.get("inquiryTextQuality") || {};
    const lineIssues = harness.state.get("inquiryLineIssues") || [];
    const details = [
      !textQuality.ok
        ? `OCR-текст заявки ненадёжен (${textQuality.reason}).`
        : null,
      ...lineIssues.map((i) => i.message),
    ]
      .filter(Boolean)
      .join("\n");

    harnessLog("warn", "inquiryQuality.rejected", {
      skillName: params.skillName,
      reason: textQuality.reason,
      issueIds: lineIssues.map((i) => i.id),
    });

    return {
      handled: true,
      approved: false,
      message:
        `КП заблокировано: проблемы с текстом заявки из PDF.\n${details}\n` +
        "Исправь таблицу (кол-во ≠ цена) или перезагрузи PDF.",
    };
  }
}

module.exports = { OfferKpInquiryQualityBlock };
