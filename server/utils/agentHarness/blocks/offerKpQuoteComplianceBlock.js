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
const {
  validateQuotePricesFromDb,
  sanitizeQuotePricesToShopDb,
} = require("../../offerKp/quoteDbPriceGate");
const {
  buildQuoteMarkdownFromDraft,
} = require("../../offerKp/inquiryDraftPrompt");
const {
  layerGuidelines,
} = require("../../../config/offerKp.harnessAntiHallucination");

/**
 * Проверяет обязательные требования КП перед create-docx/pdf.
 * Если есть inquiryDbDraft — таблица берётся ТОЛЬКО из него (агент не пишет цены).
 */
class OfferKpQuoteComplianceBlock extends BaseBlock {
  constructor() {
    super("offerKp-quote-compliance");
  }

  async install(harness) {
    if (harness.state.get("strictSourceOnly")) {
      harness.log("quote compliance installed in source-only mode");
      return;
    }
    const guidelines = [
      ...mandatoryRequirementsGuidelines(),
      ...layerGuidelines("verify"),
      ...layerGuidelines("abstain"),
      "Цены как ChatGPT: только ShopDB; нет совпадения — пустая цена / «под заказ», никогда не угадывай число.",
      "Таблицу КП сервер пересоберёт из черновика matchInquiryToDraft — не копируй одну цену 18.50 на все строки.",
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

    let content = String(params.payload?.content || "").trim();
    if (harness.state.get("strictSourceOnly")) {
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
      return {
        handled: true,
        approved: false,
        message:
          "КП из исходного файла не прошло проверку:\n" +
          formatComplianceRejection(result.violations),
      };
    }
    const catalogBlocks = collectCatalogBlocksFromHarness(harness);
    let inquiryDbDraft = harness.state.get("inquiryDbDraft") || null;

    // Черновик ещё не посчитан — посчитать сейчас из PDF.
    if (!inquiryDbDraft?.lines?.length) {
      try {
        const { parseInquiryText } = require("../../offerKp/parseInquiry");
        const {
          matchInquiryToDraft,
        } = require("../../offerKp/matchInquiryLines");
        const {
          WorkspaceParsedFiles,
        } = require("../../../models/workspaceParsedFiles");
        const workspace = harness?.ctx?.workspace;
        const invocation = harness?.ctx?.invocation;
        const files = workspace?.id
          ? await WorkspaceParsedFiles.getContextFiles(
              workspace,
              invocation?.thread_id ? { id: invocation.thread_id } : null,
              invocation?.user_id ? { id: invocation.user_id } : null
            )
          : [];
        const texts = (files || []).map((d) => d.pageContent).filter(Boolean);
        const combined = texts.join("\n\n");
        const sourceLines = parseInquiryText(combined);
        if (sourceLines.length > 0) {
          inquiryDbDraft = await matchInquiryToDraft(combined, {
            workspace,
            parsedFileTexts: texts,
          });
          if (inquiryDbDraft?.lines?.length !== sourceLines.length) {
            const matchedCount = inquiryDbDraft?.lines?.length || 0;
            const {
              buildUnmatchedDraftFromInquiry,
            } = require("../../offerKp/autoQuoteArtifacts");
            inquiryDbDraft = buildUnmatchedDraftFromInquiry(sourceLines);
            harnessLog("warn", "quoteCompliance.lineInvariantFallback", {
              source: sourceLines.length,
              matched: matchedCount,
            });
          }
          harness.state.set("inquiryDbDraft", inquiryDbDraft);
        }
      } catch (error) {
        harnessLog("warn", "quoteCompliance.draftRebuildFailed", {
          error: error?.message || String(error),
        });
      }
    }

    // Даже если ShopDB полностью недоступна, документ всё равно содержит все
    // строки заявки — без SKU и цен, которые нельзя подтвердить.
    const sourceAnalysis = harness.state.get("quoteSourceAnalysis") || {};
    const expectedSourceLines = Number(sourceAnalysis.itemCount || 0);
    if (
      expectedSourceLines > 0 &&
      Number(inquiryDbDraft?.lines?.length || 0) !== expectedSourceLines
    ) {
      const {
        buildUnmatchedDraftFromInquiry,
      } = require("../../offerKp/autoQuoteArtifacts");
      inquiryDbDraft = buildUnmatchedDraftFromInquiry(
        sourceAnalysis.items || []
      );
      harness.state.set("inquiryDbDraft", inquiryDbDraft);
      harnessLog("warn", "quoteCompliance.sourceInvariantFallback", {
        source: expectedSourceLines,
        output: inquiryDbDraft.lines.length,
      });
    }

    // Главный фикс: не доверяем таблице агента (18.50 на всё) — подмена из ShopDB draft.
    if (inquiryDbDraft?.lines?.length && params.payload) {
      const forced = buildQuoteMarkdownFromDraft(inquiryDbDraft);
      if (forced) {
        const expected = Number(
          sourceAnalysis.itemCount || inquiryDbDraft.lines.length
        );
        const actual = forced
          .split("\n")
          .filter((line) => /^\|\s*\d+\s*\|/.test(line.trim())).length;
        if (actual !== expected) {
          return {
            handled: true,
            approved: false,
            message: `Создание файла заблокировано: строк в источнике ${expected}, в КП ${actual}.`,
          };
        }
        params.payload.content = forced;
        content = forced;
        harnessLog("warn", "quoteCompliance.forcedDraftMarkdown", {
          skillName: params.skillName,
          lines: inquiryDbDraft.lines.length,
          priced: inquiryDbDraft.lines.filter((l) => Number(l.unitPriceNet) > 0)
            .length,
        });
      }
    } else {
      const sanitized = sanitizeQuotePricesToShopDb(content, {
        draft: inquiryDbDraft,
        catalogBlocks,
      });
      if (sanitized.changed && params.payload) {
        params.payload.content = sanitized.content;
        content = sanitized.content;
        harnessLog("warn", "quoteCompliance.sanitizedInventedPrices", {
          skillName: params.skillName,
          replaced: sanitized.replaced,
        });
      }
    }

    const result = checkQuoteCompliance({
      content,
      skillName: params.skillName,
    });

    const dbPriceCheck = validateQuotePricesFromDb(content, {
      draft: inquiryDbDraft,
      catalogBlocks: inquiryDbDraft?.lines?.length ? [] : catalogBlocks,
    });
    const catalogCheck = inquiryDbDraft?.lines?.length
      ? { ok: true, violations: [] }
      : validateQuotePricesAgainstCatalog(content, catalogBlocks);
    const violations = [
      ...result.violations,
      ...dbPriceCheck.violations,
      ...catalogCheck.violations,
    ];

    const complianceOk = result.ok && dbPriceCheck.ok && catalogCheck.ok;

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
      message: `КП не прошло обязательную проверку harness. Исправь нарушения и пересоздай документ:\n${details}`,
    };
  }
}

module.exports = { OfferKpQuoteComplianceBlock };
