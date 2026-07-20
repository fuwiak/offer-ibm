/**
 * Автогенерация PDF/DOCX для коммерческих предложений, когда в чат подставлен
 * каталог MySQL — не зависит от вызова create-docx-file агентом.
 */

const { v4: uuidv4 } = require("uuid");
const { writeResponseChunk } = require("../helpers/chat/responses");
const { wantsFileCreation } = require("../chats/agents");
const { generateQuoteReference } = require("../offerKpApp/pricing");
const { generateQuotePdf } = require("../offerKpApp/generateQuotePdf");
const { generateDocxFromMarkdown } = require("../offerKpApp/docxFromMarkdown");
const { QUOTE_BRAND, localeForCountry } = require("../offerKpApp/quoteBrand");
const { matchInquiryToDraft } = require("./matchInquiryLines");
const { parseInquiryText } = require("./parseInquiry");

function parseCatalogBlock(block = "") {
  const text = String(block || "").trim();
  if (!text) return null;
  const lines = text.split("\n");
  const header = lines[0] || "";
  const nameMatch = header.match(/\[Каталог ·[^\]]+\]\s*(.+)/);
  const name = (nameMatch?.[1] || header).trim();
  let price = null;
  let currency = "RUB";
  let url = "";
  let productId = null;
  for (const line of lines) {
    const priceM = line.match(/Цена:\s*([\d.,]+)\s*(\w+)/i);
    if (priceM) {
      price = parseFloat(priceM[1].replace(",", "."));
      currency = priceM[2];
    }
    const urlM = line.match(/Ссылка:\s*(\S+)/i);
    if (urlM) url = urlM[1];
    const idM = line.match(/ID товара.*:\s*(\d+)/i);
    if (idM) productId = idM[1];
  }
  if (!Number.isFinite(price) || price <= 0) return null;
  return { name, price, currency, url, productId };
}

function parseQuantity(message = "") {
  const m = String(message).match(
    /(\d+)\s*(?:шт\.?|szt\.?|pcs|pieces|sztuk|unit|units)/i
  );
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}

function parseDimensions(message = "") {
  const m = String(message).match(/M\s*(\d+)\s*[x×]\s*(\d+)/i);
  if (!m) return { lengthMm: 0, heightMm: 0 };
  return { lengthMm: parseInt(m[1], 10), heightMm: parseInt(m[2], 10) };
}

function parseQuoteMeta(message = "") {
  const m = String(message);
  let customerName = "";
  if (/BHP\s+Sp\.\s*z\s*o\.o\./i.test(m)) customerName = "BHP Sp. z o.o.";
  const clientMatch = m.match(
    /(?:клиент|klient|client|dla klienta|для)\s*[:\s]+["']?([^"'\n,]+)/i
  );
  if (clientMatch) customerName = clientMatch[1].trim();

  let country = "";
  if (/polska|poland|польш/i.test(m)) country = "Poland";
  else if (/росси|russia|россия/i.test(m)) country = "Russia";

  const qty = parseQuantity(m);
  const dims = parseDimensions(m);
  return {
    customer: {
      name: customerName || "Customer",
      country,
      city: "",
      productLine: "Fasteners",
    },
    quantity: qty,
    dimensions: dims,
  };
}

/** Приводит строку авто-КП к форме строки черновика matchInquiryToDraft. */
function toKpLine(l = {}) {
  return {
    kpStatus: l.kpStatus,
    comment: l.comment,
    requestedName: l.requestedName,
    name: l.productName,
    article: l.article,
    unit: l.unit,
    unitPriceNet: Number(l.unitPrice) || 0,
    matchType: l.matchType,
    analogOf: l.analogOf,
    unitNeedsRecalc: l.unitNeedsRecalc,
    similarSuggestion: l.similarSuggestion,
  };
}

function computeQuoteLineStats(lines = []) {
  const { resolveKpStatus } = require("./inquiryDraftPrompt");
  const stats = {
    totalCount: lines.length,
    exactCount: 0,
    analogCount: 0,
    notInDbCount: 0,
    noPriceCount: 0,
    unpricedCount: 0,
    calculatedCount: 0,
    calculatedSubtotal: 0,
  };
  for (const l of lines) {
    const kpStatus = resolveKpStatus(toKpLine(l));
    const hasPrice = Number(l.unitPrice) > 0;
    const isCalculable =
      kpStatus === "Точное соответствие" || kpStatus === "Предложен аналог";
    if (kpStatus === "Точное соответствие") stats.exactCount += 1;
    if (kpStatus === "Предложен аналог") stats.analogCount += 1;
    if (kpStatus === "Нет в базе") stats.notInDbCount += 1;
    if (!hasPrice) stats.noPriceCount += 1;
    if (hasPrice && isCalculable) {
      stats.calculatedCount += 1;
      stats.calculatedSubtotal += Number(l.unitPrice) * Number(l.quantity || 1);
    } else {
      stats.unpricedCount += 1;
    }
  }
  return stats;
}

function buildMarkdownQuote({
  reference,
  customer,
  lines,
  shipping,
  currency,
  vatRate,
}) {
  const { website, companyName, catalogLabel } = QUOTE_BRAND;
  const vatPct = Math.round(vatRate * 100);
  const { resolveKpStatus, resolveKpComment } = require("./inquiryDraftPrompt");
  const cell = (v) => String(v ?? "—").replace(/\|/g, "/") || "—";

  const stats = computeQuoteLineStats(lines);
  const rows = lines
    .map((l, i) => {
      const kpLine = toKpLine(l);
      const kpStatus = resolveKpStatus(kpLine);
      const comment = resolveKpComment(kpLine, kpStatus);
      const hasPrice = Number(l.unitPrice) > 0;
      const isCalculable =
        kpStatus === "Точное соответствие" || kpStatus === "Предложен аналог";
      const requested = cell(l.requestedName || l.productName);
      const offered =
        kpStatus === "Нет в базе" ? "Нет в базе" : cell(l.productName);
      const article = kpStatus === "Нет в базе" ? "—" : cell(l.article || "—");
      const price = hasPrice
        ? Number(l.unitPrice).toFixed(2)
        : kpStatus === "Цена по запросу"
          ? "Цена по запросу"
          : "—";
      const sum =
        hasPrice && isCalculable
          ? (Number(l.unitPrice) * Number(l.quantity || 1)).toFixed(2)
          : "—";
      return `| ${i + 1} | ${requested} | ${offered} | ${article} | ${kpStatus} | ${l.unit || "шт"} | ${l.quantity} | ${price} | ${sum} | ${cell(comment || "—")} |`;
    })
    .join("\n");

  const note =
    stats.unpricedCount > 0
      ? "\n> Итоговая сумма рассчитана только по позициям с доступной ценой. Стоимость остальных позиций подлежит уточнению.\n"
      : "";

  return `# Коммерческое предложение ${reference}

**Поставщик:** ${companyName} · [${catalogLabel}](${website})  
**Клиент:** ${customer.name}${customer.country ? ` · ${customer.country}` : ""}  
**Дата:** ${new Date().toLocaleDateString("ru-RU")}  
**Позиций в заявке:** ${lines.length} (точных: ${stats.exactCount}, аналогов: ${stats.analogCount}, нет в базе: ${stats.notInDbCount}, без цены: ${stats.noPriceCount})

## Позиции

| № | Запрошено клиентом | Предлагаемый товар | Артикул | Статус | Ед. изм. | Количество | Цена, ${currency} | Сумма, ${currency} | Комментарий |
|---|--------------------|--------------------|---------|--------|----------|------------|------|-------|-------------|
${rows}
${note}
**Сумма рассчитанных позиций:** ${stats.calculatedSubtotal.toFixed(2)} ${currency}  
**Доставка:** ${shipping.toFixed(2)} ${currency}  
**НДС ${vatPct}%:** ${(stats.calculatedSubtotal * vatRate).toFixed(2)} ${currency}  
**Итог с НДС:** ${(stats.calculatedSubtotal * (1 + vatRate) + shipping).toFixed(2)} ${currency}

## Условия

${QUOTE_BRAND.termsDocx.map((t) => `- ${t}`).join("\n")}

_${QUOTE_BRAND.warrantyNoteDocx}_

_Источник цен: каталог ${catalogLabel} (MySQL)._
`;
}

function buildQuoteArtifactsSummary({
  reference,
  pdf,
  docx,
  stats = null,
  pdfError = null,
  docxError = null,
}) {
  const fileLines = [];
  if (pdf?.filename) {
    fileLines.push(
      `- **${pdf.filename}** (PDF) — создан, карточка ниже, предпросмотр справа`
    );
  } else {
    fileLines.push(
      `- PDF — НЕ создан${pdfError ? ` (ошибка: ${pdfError})` : ""}`
    );
  }
  if (docx?.filename) {
    fileLines.push(`- **${docx.filename}** (Word) — создан, карточка ниже`);
  } else {
    fileLines.push(
      `- DOCX — НЕ создан${docxError ? ` (ошибка: ${docxError})` : ""}`
    );
  }

  const statsBlock = stats
    ? `\n\n**Итог обработки заявки:**\n` +
      `- строк в заявке: ${stats.totalCount}\n` +
      `- точное соответствие: ${stats.exactCount}\n` +
      `- предложен аналог: ${stats.analogCount}\n` +
      `- нет в базе: ${stats.notInDbCount}\n` +
      `- без цены: ${stats.noPriceCount}\n` +
      `- сумма рассчитанных строк: ${stats.calculatedSubtotal.toFixed(2)} RUB` +
      (stats.unpricedCount > 0
        ? `\n\n_Итоговая сумма рассчитана только по позициям с доступной ценой. Стоимость остальных позиций подлежит уточнению._`
        : "")
    : "";

  return `\n\n---\n\n**Коммерческое предложение ${reference} готово.**${statsBlock}\n\n**Файлы:**\n${fileLines.join("\n")}\n\n**Предпросмотр:** таблица позиций открыта в панели справа.\n**Скачивание:** кнопка «Download» на карточке каждого файла в этом сообщении.`;
}

function buildQuoteFileOutputs({ pdf, docx, markdown }) {
  const outputs = [];
  if (docx) {
    outputs.push({
      type: "DocxFileDownload",
      payload: {
        filename: docx.filename,
        storageFilename: docx.storageFilename,
        fileSize: docx.fileSize,
        previewMarkdown: markdown,
        skipAutoPreview: true,
      },
    });
  }
  if (pdf) {
    outputs.push({
      type: "PdfFileDownload",
      payload: {
        filename: pdf.filename,
        storageFilename: pdf.storageFilename,
        fileSize: pdf.fileSize,
        skipAutoPreview: true,
      },
    });
  }
  return outputs;
}

function buildGeneratedFilesList({ pdf, docx, markdown }) {
  const files = [];
  if (pdf) {
    files.push({
      kind: "pdf",
      filename: pdf.filename,
      storageFilename: pdf.storageFilename,
      fileSize: pdf.fileSize,
    });
  }
  if (docx) {
    files.push({
      kind: "docx",
      filename: docx.filename,
      storageFilename: docx.storageFilename,
      fileSize: docx.fileSize,
      previewMarkdown: markdown,
    });
  }
  return files;
}

function buildQuoteLinesFromCatalog(products, meta) {
  const { quantity, dimensions } = meta;
  return products.map((p) => {
    const lineTotal = Number((p.price * quantity).toFixed(2));
    return {
      productName: p.name,
      productNameRu: p.name,
      lengthMm: dimensions.lengthMm,
      heightMm: dimensions.heightMm,
      quantity,
      unitPrice: p.price,
      lineTotal,
      spec: "Catalog",
      productUrl: p.url,
    };
  });
}

/**
 * Безопасный fallback при недоступной ShopDB: сохраняет каждую строку заявки
 * один-к-одному, но не придумывает товар, SKU или цену.
 */
function buildUnmatchedDraftFromInquiry(inquiryLines = []) {
  return {
    reference: generateQuoteReference({ prefix: "KP" }),
    lines: inquiryLines.map((line) => {
      const quantity = Number(line.quantity);
      return {
        inquiryRaw: line.raw,
        name: line.name || line.raw,
        requestedName: line.name || line.raw,
        article: "",
        productId: "",
        quantity: Number.isFinite(quantity) ? quantity : 1,
        unit: line.unit || "шт",
        priceWithVat: 0,
        unitPriceNet: 0,
        lineTotal: 0,
        weightKg: 0,
        status: "Нет в наличии",
        kpStatus: "Нет в базе",
        unitNeedsRecalc: Boolean(line.needsReview),
        matchType: "none",
        analogOf: null,
        similarSuggestion: null,
        comment:
          "Совпадение и подтверждённая цена в ShopDB отсутствуют — цена по запросу",
        thread: line.thread,
        alternatives: [],
      };
    }),
    subtotal: 0,
    totalWeightKg: 0,
    total: 0,
  };
}

/**
 * @param {object} opts
 * @param {import("express").Response} opts.response
 * @param {string} opts.uuid — uuid основного ответа чата
 * @param {string} opts.message
 * @param {string[]} opts.catalogBlocks
 */
async function emitAutoQuoteArtifacts({
  response,
  uuid,
  message,
  catalogBlocks = [],
  workspace = null,
  chatHistory = null,
  parsedFileTexts = [],
}) {
  // При наличии файла именно он определяет перечень строк. Сообщение пользователя
  // служит командой и не должно дублировать/расширять приложенную заявку.
  const sourceTexts = (parsedFileTexts || []).filter(Boolean);
  const inquirySource = sourceTexts.length
    ? sourceTexts.join("\n\n")
    : String(message || "");
  const inquiryLines = parseInquiryText(inquirySource);

  if (
    !wantsFileCreation(message) &&
    !hasInquirySignals(inquirySource || message)
  ) {
    return false;
  }

  let draft = null;
  try {
    draft = await matchInquiryToDraft(inquirySource, {
      workspace,
      chatHistory,
      parsedFileTexts,
    });
  } catch (e) {
    console.error("[offerKp] matchInquiryToDraft:", e.message);
  }

  // N позиций на входе = N строк в обоих документах. При любой ошибке или
  // неполном результате ShopDB возвращаем полный перечень без выдуманных цен.
  if (
    inquiryLines.length > 0 &&
    Number(draft?.lines?.length || 0) !== inquiryLines.length
  ) {
    console.warn(
      `[offerKp] quote line invariant fallback: source=${inquiryLines.length}, matched=${draft?.lines?.length || 0}`
    );
    draft = buildUnmatchedDraftFromInquiry(inquiryLines);
  }

  const products = (catalogBlocks || []).map(parseCatalogBlock).filter(Boolean);
  if (!draft?.lines?.length && !products.length) return false;

  const meta = parseQuoteMeta(message);
  const lines = draft?.lines?.length
    ? draft.lines.map((l) => ({
        productName: l.name,
        productNameRu: l.name,
        requestedName: l.requestedName,
        matchType: l.matchType,
        kpStatus: l.kpStatus,
        unitNeedsRecalc: l.unitNeedsRecalc,
        unit: l.unit,
        similarSuggestion: l.similarSuggestion || null,
        article: l.article,
        sku: l.article,
        lengthMm: l.thread?.size ? Number(l.thread.size) : 0,
        heightMm: l.thread?.length ? Number(l.thread.length) : 0,
        quantity: l.quantity,
        unitPrice: l.unitPriceNet || l.priceWithVat / 1.2,
        priceWithVat: l.priceWithVat,
        lineTotal: l.lineTotal,
        weightKg: l.weightKg,
        status: l.status,
        analogOf: l.analogOf,
        comment: l.comment,
        alternatives: l.alternatives,
        spec:
          l.matchType === "analog"
            ? `ANALOG${l.analogOf ? `: ${l.analogOf}` : ""}`
            : Number(l.unitPriceNet) > 0
              ? "Catalog"
              : "NOT IN CATALOG",
        productUrl: l.productUrl,
      }))
    : buildQuoteLinesFromCatalog(products.slice(0, 5), meta);

  if (inquiryLines.length > 0 && lines.length !== inquiryLines.length) {
    throw new Error(
      `Quote line invariant violated: source=${inquiryLines.length}, output=${lines.length}`
    );
  }

  const subtotal =
    draft?.subtotal ?? lines.reduce((s, l) => s + l.lineTotal, 0);
  const shipping = 0;
  const total = subtotal + shipping;
  const { currency, vatRate } = localeForCountry(meta.customer.country);
  const vatAmount = Number((total * vatRate).toFixed(2));
  const reference =
    draft?.reference ||
    generateQuoteReference({
      prefix: QUOTE_BRAND.referencePrefix,
    });

  const quoteData = {
    reference,
    customer: meta.customer,
    contact: QUOTE_BRAND.defaultContact,
    lines,
    shipping,
    subtotal,
    total,
    createdAt: new Date(),
  };

  const markdown = buildMarkdownQuote({
    reference,
    customer: meta.customer,
    lines,
    subtotal,
    shipping,
    total,
    currency,
    vatRate,
    vatAmount,
  });

  const safeRef = reference.replace(/[^\w-]+/g, "_");
  // Обязательное создание файлов: при ошибке — один повтор, статус не выдумываем.
  async function runWithRetry(label, factory) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return { file: await factory(), error: null };
      } catch (e) {
        console.error(
          `[offerKp] auto quote ${label} (попытка ${attempt}):`,
          e?.message || e
        );
        if (attempt === 2)
          return { file: null, error: e?.message || String(e) };
      }
    }
    return { file: null, error: "unknown" };
  }

  const [pdfOutcome, docxOutcome] = await Promise.all([
    runWithRetry("PDF", () => generateQuotePdf(quoteData)),
    runWithRetry("DOCX", () =>
      generateDocxFromMarkdown({
        markdown,
        filename: `KP-${safeRef}.docx`,
      })
    ),
  ]);
  const pdf = pdfOutcome.file;
  const docx = docxOutcome.file;

  const stats = computeQuoteLineStats(lines);

  if (!pdf && !docx) {
    // Оба инструмента упали: вернуть готовое содержание КП + ошибку, без ложного успеха.
    writeResponseChunk(response, {
      uuid,
      type: "textResponseChunk",
      textResponse:
        `\n\n---\n\n**Не удалось создать файлы КП ${reference}.**\n` +
        `PDF: ошибка (${pdfOutcome.error}). DOCX: ошибка (${docxOutcome.error}).\n\n` +
        `Содержание КП подготовлено полностью:\n\n${markdown}`,
      close: false,
      error: false,
    });
    return {
      summaryText: null,
      reference,
      outputs: [],
      generatedFiles: [],
      stats,
      pdfError: pdfOutcome.error,
      docxError: docxOutcome.error,
    };
  }

  const outputs = buildQuoteFileOutputs({ pdf, docx, markdown });
  const generatedFiles = buildGeneratedFilesList({ pdf, docx, markdown });

  writeResponseChunk(response, {
    uuid,
    type: "offerKpQuotePanel",
    content: {
      documentPanelView: "draftTable",
      generatedFiles,
      quoteDraft: {
        step: 3,
        reference,
        customer: meta.customer,
        priceMode: "public",
        hardwareLines: draft?.lines || lines,
        generatedFiles,
        lines: lines.map((l) => ({
          productId: l.article || "catalog",
          lengthMm: l.lengthMm || 0,
          heightMm: l.heightMm || 0,
          quantity: l.quantity,
        })),
        shipping,
        preview: {
          lines,
          subtotal,
          shipping,
          total,
          totalWeightKg: draft?.totalWeightKg || 0,
        },
      },
      pdfFile: pdf
        ? {
            filename: pdf.filename,
            storageFilename: pdf.storageFilename,
          }
        : null,
    },
    close: false,
    error: false,
  });

  for (const output of outputs) {
    writeResponseChunk(response, {
      uuid: uuidv4(),
      type: "fileDownloadCard",
      content: output.payload,
      close: false,
      error: false,
    });
  }

  const summaryText = buildQuoteArtifactsSummary({
    reference,
    pdf,
    docx,
    stats,
    pdfError: pdfOutcome.error,
    docxError: docxOutcome.error,
  });
  writeResponseChunk(response, {
    uuid,
    type: "textResponseChunk",
    textResponse: summaryText,
    close: false,
    error: false,
  });

  return { summaryText, reference, outputs, generatedFiles, stats };
}

function hasInquirySignals(message) {
  const m = String(message || "");
  return (
    /\bdin\s*\d{3}/i.test(m) ||
    /\bgost\s*\d{4}/i.test(m) ||
    /\bm\s*\d+\s*[x×]\s*\d+/i.test(m) ||
    /коммерческ|кп\b|оферт/i.test(m)
  );
}

module.exports = {
  parseCatalogBlock,
  parseQuoteMeta,
  buildMarkdownQuote,
  computeQuoteLineStats,
  buildQuoteArtifactsSummary,
  buildQuoteFileOutputs,
  buildGeneratedFilesList,
  buildUnmatchedDraftFromInquiry,
  emitAutoQuoteArtifacts,
  hasInquirySignals,
};
