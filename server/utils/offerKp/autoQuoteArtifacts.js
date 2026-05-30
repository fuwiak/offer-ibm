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

function buildMarkdownQuote({
  reference,
  customer,
  lines,
  subtotal,
  shipping,
  total,
  currency,
  vatRate,
  vatAmount,
}) {
  const { website, companyName, catalogLabel } = QUOTE_BRAND;
  const vatPct = Math.round(vatRate * 100);
  const rows = lines
    .map(
      (l, i) =>
        `| ${i + 1} | ${l.productName} | ${l.quantity} | ${l.unitPrice.toFixed(2)} ${currency} | ${l.lineTotal.toFixed(2)} ${currency} |`
    )
    .join("\n");

  return `# Коммерческое предложение ${reference}

**Поставщик:** ${companyName} · [${catalogLabel}](${website})  
**Клиент:** ${customer.name}${customer.country ? ` · ${customer.country}` : ""}  
**Дата:** ${new Date().toLocaleDateString("ru-RU")}

## Позиции

| № | Наименование | Кол-во | Цена за ед. | Сумма |
|---|--------------|--------|-------------|-------|
${rows}

**Подытог:** ${subtotal.toFixed(2)} ${currency}  
**Доставка:** ${shipping.toFixed(2)} ${currency}  
**НДС ${vatPct}%:** ${vatAmount.toFixed(2)} ${currency}  
**Итого с НДС:** ${(total + vatAmount).toFixed(2)} ${currency}

## Условия

${QUOTE_BRAND.termsDocx.map((t) => `- ${t}`).join("\n")}

_${QUOTE_BRAND.warrantyNoteDocx}_

_Источник цен: каталог ${catalogLabel} (MySQL)._
`;
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
}) {
  if (!wantsFileCreation(message)) return false;
  const products = (catalogBlocks || []).map(parseCatalogBlock).filter(Boolean);
  if (!products.length) return false;

  const meta = parseQuoteMeta(message);
  const lines = buildQuoteLinesFromCatalog(products.slice(0, 5), meta);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const shipping = 0;
  const total = subtotal + shipping;
  const { currency, vatRate } = localeForCountry(meta.customer.country);
  const vatAmount = Number((total * vatRate).toFixed(2));
  const reference = generateQuoteReference({
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
  const [pdfResult, docxResult] = await Promise.allSettled([
    generateQuotePdf(quoteData),
    generateDocxFromMarkdown({
      markdown,
      filename: `KP-${safeRef}.docx`,
    }),
  ]);
  if (pdfResult.status === "rejected") {
    console.error("[offerKp] auto quote PDF:", pdfResult.reason?.message || pdfResult.reason);
  }
  if (docxResult.status === "rejected") {
    console.error("[offerKp] auto quote DOCX:", docxResult.reason?.message || docxResult.reason);
  }
  const pdf = pdfResult.status === "fulfilled" ? pdfResult.value : null;
  const docx = docxResult.status === "fulfilled" ? docxResult.value : null;
  if (!pdf && !docx) return false;

  if (docx) {
    writeResponseChunk(response, {
      uuid: uuidv4(),
      type: "fileDownloadCard",
      content: {
        filename: docx.filename,
        storageFilename: docx.storageFilename,
        fileSize: docx.fileSize,
        previewMarkdown: markdown,
      },
      close: false,
      error: false,
    });
  }

  if (pdf) {
    writeResponseChunk(response, {
      uuid: uuidv4(),
      type: "fileDownloadCard",
      content: {
        filename: pdf.filename,
        storageFilename: pdf.storageFilename,
        fileSize: pdf.fileSize,
      },
      close: false,
      error: false,
    });
  }

  writeResponseChunk(response, {
    uuid,
    type: "offerKpQuotePanel",
    content: {
      documentPanelView: "quotePreview",
      quoteDraft: {
        step: 3,
        reference,
        customer: meta.customer,
        priceMode: "public",
        lines: lines.map((l) => ({
          productId: "catalog",
          lengthMm: l.lengthMm,
          heightMm: l.heightMm,
          quantity: l.quantity,
        })),
        shipping,
        preview: { lines, subtotal, shipping, total },
      },
    },
    close: false,
    error: false,
  });

  return true;
}

module.exports = {
  parseCatalogBlock,
  parseQuoteMeta,
  buildMarkdownQuote,
  emitAutoQuoteArtifacts,
};
