const createFilesLib = require("../agents/aibitat/plugins/create-files/lib");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  VerticalAlign,
  ShadingType,
} = require("docx");
const {
  QUOTE_BRAND,
  localeForCountry,
  makeMoneyFormatter,
} = require("./quoteBrand");

/** Match QuotePreview / PDF commercial-offer look (navy + green accent). */
const GREEN = "0C7D69";
const GREEN_LIGHT = "F1F8F7";
const NAVY = "1B2F5A";
const GRAY = "475569";
const WHITE = "FFFFFF";
const BORDER = "E2E8E8";

function fmtDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function addDays(d, days) {
  const date = new Date(
    d instanceof Date ? d.getTime() : new Date(d).getTime()
  );
  date.setDate(date.getDate() + days);
  return date;
}

const NONE_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = {
  top: NONE_BORDER,
  bottom: NONE_BORDER,
  left: NONE_BORDER,
  right: NONE_BORDER,
  insideHorizontal: NONE_BORDER,
  insideVertical: NONE_BORDER,
};

function run(text, opts = {}) {
  return new TextRun({
    text: String(text ?? ""),
    font: "Calibri",
    size: opts.size ?? 20,
    bold: opts.bold ?? false,
    color: opts.color ?? NAVY,
  });
}

function para(children, opts = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    spacing: { after: opts.after ?? 60, before: opts.before ?? 0 },
    alignment: opts.alignment,
  });
}

function cell(children, opts = {}) {
  return new TableCell({
    children: Array.isArray(children) ? children : [children],
    width: opts.width
      ? { size: opts.width, type: WidthType.PERCENTAGE }
      : undefined,
    columnSpan: opts.columnSpan,
    shading: opts.fill
      ? { fill: opts.fill, color: "auto", type: ShadingType.CLEAR }
      : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    borders: opts.borders ?? {
      top: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
      left: { style: BorderStyle.NONE, size: 0, color: WHITE },
      right: { style: BorderStyle.NONE, size: 0, color: WHITE },
    },
  });
}

function lineName(ql) {
  return ql.name || ql.productName || ql.productId || "—";
}

function lineArticle(ql) {
  return ql.article || ql.sku || "—";
}

function lineUnitNet(ql, vatRate) {
  const qty = Number(ql.quantity) || 0;
  if (ql.unitPriceNet != null && Number.isFinite(Number(ql.unitPriceNet))) {
    return Number(ql.unitPriceNet);
  }
  if (ql.priceWithVat != null && Number.isFinite(Number(ql.priceWithVat))) {
    return Number(ql.priceWithVat) / (1 + vatRate);
  }
  if (ql.unitPrice != null && Number.isFinite(Number(ql.unitPrice))) {
    return Number(ql.unitPrice);
  }
  const total = Number(ql.lineTotal) || 0;
  return qty > 0 ? total / qty : 0;
}

function lineNetTotal(ql, vatRate) {
  if (ql.lineTotal != null && Number.isFinite(Number(ql.lineTotal))) {
    return Number(ql.lineTotal);
  }
  const qty = Number(ql.quantity) || 0;
  return qty * lineUnitNet(ql, vatRate);
}

/**
 * Generate a purolat.com quotation as Word (.docx) — same layout as
 * QuotePreview / PDF: brand, parties, Позиция|Артикул|Кол-во|Цена/шт|Сумма, totals, terms.
 */
async function generateQuoteDocx(quoteData) {
  const {
    reference = QUOTE_BRAND.defaultReference,
    customer = {},
    lines = [],
    shipping = 0,
    subtotal = 0,
    createdAt = new Date(),
    doc: docOverrides = {},
  } = quoteData;

  const localeDefaults = localeForCountry(customer.country);
  const currency = quoteData.currency || localeDefaults.currency;
  const locale = localeDefaults.locale;
  const vatRate =
    typeof quoteData.vatRate === "number"
      ? quoteData.vatRate
      : typeof docOverrides.vatRate === "number"
        ? docOverrides.vatRate
        : localeDefaults.vatRate;
  const money = makeMoneyFormatter(currency, locale);

  const computedSubtotal =
    Number(subtotal) ||
    lines.reduce((sum, ql) => sum + lineNetTotal(ql, vatRate), 0);
  const ship = Number(shipping) || 0;
  const net = computedSubtotal + ship;
  const vat = net * vatRate;
  const grandTotal = net + vat;

  const brandCompany = docOverrides.brandCompany || QUOTE_BRAND.companyName;
  const brandTagline = docOverrides.brandTagline || QUOTE_BRAND.tagline;
  const brandWebsite = docOverrides.brandWebsite || QUOTE_BRAND.website;
  const title = docOverrides.title || "КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ";
  const supplierCompany =
    docOverrides.supplierCompany || QUOTE_BRAND.companyName;
  const supplierAddress = docOverrides.supplierAddress || QUOTE_BRAND.address;
  const supplierWebsite = docOverrides.supplierWebsite || QUOTE_BRAND.website;
  const supplierEmail = docOverrides.supplierEmail || QUOTE_BRAND.email || "";
  const supplierPhone = docOverrides.supplierPhone || QUOTE_BRAND.phone || "";
  const positionsLabel =
    docOverrides.positionsLabel ||
    `ПОЗИЦИИ КАТАЛОГА ${QUOTE_BRAND.catalogLabel.toUpperCase()}`;
  const termsLabel = docOverrides.termsLabel || "УСЛОВИЯ";
  const signOff = docOverrides.signOff || "С уважением,";
  const signCompany = docOverrides.signCompany || QUOTE_BRAND.companyName;
  const validUntil = docOverrides.validUntil
    ? new Date(docOverrides.validUntil)
    : addDays(createdAt, 30);
  const terms = (
    docOverrides.terms || [
      ...(QUOTE_BRAND.termsDocx || QUOTE_BRAND.terms),
      `Цены в ${currency}; позиции из каталога ${QUOTE_BRAND.catalogLabel}.`,
      QUOTE_BRAND.warrantyNoteDocx || QUOTE_BRAND.warrantyNote,
    ]
  ).map((t) => String(t).replace("{currency}", currency));

  // ── Header: brand + title / meta (same as QuotePreview) ───────────────
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          cell(
            [
              para(
                run(brandCompany, { bold: true, size: 32, color: GREEN }),
                { after: 20 }
              ),
              para(run(brandTagline, { size: 16, color: GRAY })),
              para(run(brandWebsite, { size: 15, color: GRAY })),
            ],
            { width: 52, borders: NO_BORDERS }
          ),
          cell(
            [
              para(run(title, { bold: true, size: 28, color: NAVY }), {
                after: 40,
                alignment: AlignmentType.RIGHT,
              }),
              para(run(`№ ${reference}`, { size: 18, color: GRAY }), {
                after: 10,
                alignment: AlignmentType.RIGHT,
              }),
              para(run(`Дата: ${fmtDate(createdAt)}`, { size: 18, color: GRAY }), {
                after: 10,
                alignment: AlignmentType.RIGHT,
              }),
              para(
                run(`Действительно до: ${fmtDate(validUntil)}`, {
                  size: 18,
                  color: GRAY,
                }),
                { alignment: AlignmentType.RIGHT }
              ),
            ],
            { width: 48, borders: NO_BORDERS }
          ),
        ],
      }),
    ],
  });

  // ── ПОСТАВЩИК / ПОКУПАТЕЛЬ ─────────────────────────────────────────────
  const parties = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          cell(
            [
              para(run("ПОСТАВЩИК", { bold: true, size: 15, color: GREEN })),
              para(run(supplierCompany, { bold: true, size: 20 })),
              para(run(supplierAddress, { size: 17, color: GRAY })),
              para(run(supplierWebsite, { size: 17, color: GRAY })),
              ...(supplierEmail
                ? [para(run(supplierEmail, { size: 17, color: GRAY }))]
                : []),
              ...(supplierPhone
                ? [para(run(supplierPhone, { size: 17, color: GRAY }))]
                : []),
            ],
            { width: 50, borders: NO_BORDERS }
          ),
          cell(
            [
              para(run("ПОКУПАТЕЛЬ", { bold: true, size: 15, color: GREEN })),
              para(run(customer.name || "—", { bold: true, size: 20 })),
              ...(customer.country
                ? [para(run(customer.country, { size: 17, color: GRAY }))]
                : []),
            ],
            { width: 50, borders: NO_BORDERS }
          ),
        ],
      }),
    ],
  });

  // ── Table: Позиция | Артикул | Кол-во | Цена/шт | Сумма ───────────────
  const headerFill = GREEN;
  const itemHeaderRow = new TableRow({
    tableHeader: true,
    children: [
      cell(para(run("Позиция", { bold: true, size: 16, color: WHITE })), {
        width: 40,
        fill: headerFill,
        borders: NO_BORDERS,
      }),
      cell(para(run("Артикул", { bold: true, size: 16, color: WHITE })), {
        width: 18,
        fill: headerFill,
        borders: NO_BORDERS,
      }),
      cell(
        para(run("Кол-во", { bold: true, size: 16, color: WHITE }), {
          alignment: AlignmentType.RIGHT,
        }),
        { width: 12, fill: headerFill, borders: NO_BORDERS }
      ),
      cell(
        para(run("Цена/шт", { bold: true, size: 16, color: WHITE }), {
          alignment: AlignmentType.RIGHT,
        }),
        { width: 15, fill: headerFill, borders: NO_BORDERS }
      ),
      cell(
        para(run("Сумма", { bold: true, size: 16, color: WHITE }), {
          alignment: AlignmentType.RIGHT,
        }),
        { width: 15, fill: headerFill, borders: NO_BORDERS }
      ),
    ],
  });

  const itemRows = lines.map((ql, i) => {
    const qty = Number(ql.quantity) || 0;
    const unit = lineUnitNet(ql, vatRate);
    const sum = lineNetTotal(ql, vatRate);
    const fill = i % 2 === 1 ? GREEN_LIGHT : WHITE;
    return new TableRow({
      children: [
        cell(para(run(lineName(ql), { size: 18 })), { width: 40, fill }),
        cell(para(run(lineArticle(ql), { size: 18 })), { width: 18, fill }),
        cell(
          para(run(String(qty), { size: 18 }), {
            alignment: AlignmentType.RIGHT,
          }),
          { width: 12, fill }
        ),
        cell(
          para(run(money(unit), { size: 18 }), {
            alignment: AlignmentType.RIGHT,
          }),
          { width: 15, fill }
        ),
        cell(
          para(run(money(sum), { bold: true, size: 18 }), {
            alignment: AlignmentType.RIGHT,
          }),
          { width: 15, fill }
        ),
      ],
    });
  });

  const itemsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [itemHeaderRow, ...itemRows],
  });

  function totalsRow(label, value, opts = {}) {
    return new TableRow({
      children: [
        cell(
          para(
            run(label, {
              bold: opts.bold,
              size: opts.big ? 20 : 18,
              color: opts.color || GRAY,
            }),
            { alignment: AlignmentType.RIGHT }
          ),
          { width: 70, fill: opts.fill, borders: NO_BORDERS }
        ),
        cell(
          para(
            run(value, {
              bold: opts.bold,
              size: opts.big ? 22 : 18,
              color: opts.color || NAVY,
            }),
            { alignment: AlignmentType.RIGHT }
          ),
          { width: 30, fill: opts.fill, borders: NO_BORDERS }
        ),
      ],
    });
  }

  const totalsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      totalsRow("Подытог", money(computedSubtotal)),
      totalsRow("Доставка", money(ship)),
      totalsRow(`НДС (${Math.round(vatRate * 100)}%)`, money(vat)),
      totalsRow("Итого с НДС", money(grandTotal), {
        bold: true,
        big: true,
        color: WHITE,
        fill: GREEN,
      }),
    ],
  });

  function sectionHeading(text) {
    return new Paragraph({
      spacing: { before: 240, after: 100 },
      children: [run(text, { bold: true, size: 18, color: GREEN })],
    });
  }

  const wordDoc = new Document({
    title: `Коммерческое предложение ${reference}`,
    creator: brandCompany,
    description: `КП ${reference} · ${QUOTE_BRAND.catalogLabel}`,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [
          headerTable,
          new Paragraph({
            spacing: { before: 120, after: 160 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 18, color: GREEN },
            },
            children: [],
          }),
          parties,
          sectionHeading(positionsLabel),
          itemsTable,
          new Paragraph({ spacing: { after: 140 }, children: [] }),
          totalsTable,
          sectionHeading(termsLabel),
          ...terms.map(
            (t) =>
              new Paragraph({
                spacing: { after: 50 },
                bullet: { level: 0 },
                children: [run(t, { size: 17, color: GRAY })],
              })
          ),
          new Paragraph({ spacing: { before: 280 }, children: [] }),
          para(run(signOff, { bold: true, size: 20 })),
          para(run(signCompany, { bold: true, size: 18, color: GREEN })),
          new Paragraph({
            spacing: { before: 160 },
            children: [
              run(`${brandCompany} — ${brandWebsite}`, {
                size: 14,
                color: GRAY,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(wordDoc);
  const friendlyName = customer.name
    ? `KP_${customer.name.replace(/\s+/g, "_")}_${reference}.docx`
    : `KP_${reference}.docx`;

  const saved = await createFilesLib.saveGeneratedFile({
    fileType: "quote",
    extension: "docx",
    buffer,
    displayFilename: friendlyName,
  });

  return {
    filename: saved.displayFilename,
    storageFilename: saved.filename,
    filePath: saved.storagePath,
    fileSize: saved.fileSize,
  };
}

module.exports = { generateQuoteDocx };
