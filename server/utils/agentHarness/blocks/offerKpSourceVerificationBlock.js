const { BaseBlock } = require("../BaseBlock");
const { harnessLog } = require("../harnessLog");
const {
  analyzeQuoteSourceDocuments,
  buildSourceOnlyQuoteMarkdown,
  verifySourceDeclaration,
} = require("../../offerKp/quoteSourceVerification");

const VERIFY_TOOL_NAME = "verify-quote-source";
const DOC_SKILLS = new Set(["create-docx-file", "create-pdf-file"]);

const STRICT_SOURCE_GUIDELINES = [
  "СТРОГИЙ РЕЖИМ ИСТОЧНИКА: приложенный файл — единственный источник данных о товарах и коммерческих условиях.",
  "Дословно извлеки все строки заявки. Не заменяй товары аналогами, не сокращай и не объединяй позиции, не исправляй ГОСТ/DIN/размеры по своему усмотрению.",
  "Количество и единицы измерения бери только из файла: кг нельзя заменять на шт., а 30 кг нельзя интерпретировать как 30 штук.",
  "Не используй ShopDB, каталог, интернет, память или предыдущие запросы для цен, товаров, поставщика, клиента, даты, срока поставки, оплаты, доставки, НДС и реквизитов.",
  "Если текст не читается, напиши [НЕРАЗБОРЧИВО — ТРЕБУЕТ ПРОВЕРКИ], ничего не угадывай.",
  "Если в источнике нет цен, цена и сумма — «уточняется»; не вызывай quote-calculator, не считай НДС и общий итог.",
  "До DOCX/PDF выведи анализ источника, полную таблицу, строку «Проверено: извлечено X из X позиций», проект КП, отсутствующие данные и финальную проверку.",
  `Перед create-docx-file/create-pdf-file обязательно вызови ${VERIFY_TOOL_NAME} с полным массивом items. Документы разрешены только при ready_to_generate=true, подтверждённом сервером.`,
  "Не сообщай об успешном создании файла, пока инструмент фактически не вернул Success. При ошибке процитируй её точно и напиши: «Файл не был создан из-за технической ошибки инструмента».",
];

async function loadSourceDocuments(harness) {
  const workspace = harness?.ctx?.workspace;
  const invocation = harness?.ctx?.invocation;
  if (!workspace?.id) return [];
  const {
    WorkspaceParsedFiles,
  } = require("../../../models/workspaceParsedFiles");
  return WorkspaceParsedFiles.getContextFiles(
    workspace,
    invocation?.thread_id ? { id: invocation.thread_id } : null,
    invocation?.user_id ? { id: invocation.user_id } : null
  );
}

class OfferKpSourceVerificationBlock extends BaseBlock {
  constructor() {
    super("offerKp-source-verification");
  }

  async install(harness) {
    if (!harness.state.get("quoteDocumentRequest")) return;

    const documents = await loadSourceDocuments(harness);
    if (!documents.length) return;

    const analysis = analyzeQuoteSourceDocuments(documents);
    harness.state.set("strictSourceOnly", true);
    harness.state.set("quoteSourceAnalysis", analysis);
    harness.state.set("inquiryLineCount", analysis.itemCount);
    harness.state.set("sourceVerificationReady", false);
    const serverAnalysisGuideline =
      `Серверный контроль источника: страниц=${analysis.pageCount}; ` +
      `позиций=${analysis.itemCount}; единицы=${analysis.units.join(", ") || "не определены"}; ` +
      `цены=${analysis.pricesPresent ? "есть" : "отсутствуют"}; ` +
      `поставщик=${analysis.supplier ? "есть" : "отсутствует"}; ` +
      `заказчик=${analysis.customer ? "есть" : "отсутствует"}; ` +
      `период=${analysis.period || "не указан"}; ` +
      `нечитаемые фрагменты=${analysis.unreadableFragments}.`;
    harness.state.set("contextGuidelines", [
      ...STRICT_SOURCE_GUIDELINES,
      serverAnalysisGuideline,
    ]);

    const aibitat = harness.aibitat;
    aibitat.function({
      super: aibitat,
      name: VERIFY_TOOL_NAME,
      description:
        "Mandatory source-integrity gate before creating DOCX/PDF. Submit the full extracted item list and verification flags. The server compares item count, order, quantities, units and technical designations with the attached source file.",
      parameters: {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
          source_verified: { type: "boolean" },
          items_expected: { type: "integer", minimum: 1 },
          items_extracted: { type: "integer", minimum: 1 },
          prices_present: { type: "boolean" },
          ready_to_generate: { type: "boolean" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                number: { type: "integer", minimum: 1 },
                name: { type: "string" },
                unit: { type: "string" },
                quantity: { type: "number" },
              },
              required: ["number", "name", "unit", "quantity"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "source_verified",
          "items_expected",
          "items_extracted",
          "prices_present",
          "ready_to_generate",
          "items",
        ],
        additionalProperties: false,
      },
      handler: async (payload = {}) => {
        const result = verifySourceDeclaration(payload, analysis);
        harness.state.set("sourceVerificationReady", result.ok);
        harness.state.set("sourceVerification", result.verification);
        harness.state.set("sourceVerificationErrors", result.errors);
        harnessLog(result.ok ? "info" : "warn", "sourceVerification.result", {
          ...result.verification,
          errors: result.errors,
        });
        return JSON.stringify(result);
      },
    });

    const agent = aibitat.agents?.get("@agent");
    if (agent?.functions && !agent.functions.includes(VERIFY_TOOL_NAME)) {
      agent.functions.push(VERIFY_TOOL_NAME);
    }

    harnessLog("info", "sourceVerification.installed", {
      pages: analysis.pageCount,
      items: analysis.itemCount,
      units: analysis.units,
      pricesPresent: analysis.pricesPresent,
      sourceVerified: analysis.sourceVerified,
    });
  }

  async beforeToolApproval(params, harness) {
    if (!harness.state.get("strictSourceOnly")) return null;

    if (params.skillName === VERIFY_TOOL_NAME) {
      return {
        handled: true,
        approved: true,
        message: "Source verification - auto-approved.",
      };
    }

    if (params.skillName === "quote-calculator") {
      const analysis = harness.state.get("quoteSourceAnalysis") || {};
      if (!analysis.pricesPresent) {
        return {
          handled: true,
          approved: false,
          message:
            "Калькулятор запрещён: в исходном документе цены отсутствуют.",
        };
      }
      return null;
    }

    if (!DOC_SKILLS.has(params.skillName)) return null;

    if (!harness.state.get("sourceVerificationReady")) {
      const errors = harness.state.get("sourceVerificationErrors") || [];
      harnessLog("warn", "sourceVerification.documentBlocked", {
        skillName: params.skillName,
        errors,
      });
      return {
        handled: true,
        approved: false,
        message:
          `Создание файла заблокировано: сначала успешно вызови ${VERIFY_TOOL_NAME}.` +
          (errors.length ? `\n${errors.join("\n")}` : ""),
      };
    }

    const analysis = harness.state.get("quoteSourceAnalysis") || {};
    if (analysis.pricesPresent) {
      return {
        handled: true,
        approved: false,
        message:
          "Создание файла заблокировано: источник содержит цены, требуется их отдельная построчная серверная проверка.",
      };
    }

    if (params.payload) {
      params.payload.content = buildSourceOnlyQuoteMarkdown(analysis);
      delete params.payload.author;
      params.payload.includeTitlePage = false;
    }
    harness.state.set("canonicalSourceQuoteApplied", true);
    return null;
  }
}

module.exports = {
  OfferKpSourceVerificationBlock,
  STRICT_SOURCE_GUIDELINES,
  VERIFY_TOOL_NAME,
};
