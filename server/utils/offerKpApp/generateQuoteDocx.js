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
} = require("docx");
const {
  QUOTE_BRAND,
  localeForCountry,
  makeMoneyFormatter,
} = require("./quoteBrand");

const GREEN = "0C7D69";
const GREEN_LIGHT = "E8F5F4";
const NAVY = "1B2F5A";
const GRAY = "475569";
const WHITE = "FFFFFF";
const BORDER = "D1DBDB";

function fmtDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function addDays(d, days) {
  const date = new Date(d instanceof Date ? d.getTime() : new Date(d).getTime());
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
    size: opts.size ?? 19, // half-points (≈9.5pt)
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
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { fill: opts.fill, color: "auto", type: "clear" } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    borders: opts.borders ?? {
      top: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
      left: { style: BorderStyle.NONE, size: 0, color: WHITE },
      right: { style: BorderStyle.NONE, size: 0, color: WHITE },
    },
  });
}

/**
 * Generate a purolat.com quotation as an editable Word (.docx) file.
 *
 * @param {object} quoteData
 * @param {string} quoteData.reference
 * @param {object} quoteData.customer  { name, country, city, address }
 * @param {object} quoteData.contact   { name, email, phone }
 * @param {Array}  quoteData.lines     calculated quote lines
 * @param {number} quoteData.shipping
 * @param {number} quoteData.subtotal
 * @param {number} [quoteData.vatRate]
 * @param {string} [quoteData.currency]
 * @param {Date|string} quoteData.createdAt
 * @returns {Promise<{filename, storageFilename, filePath, fileSize}>}
 */
async function generateQuoteDocx(quoteData) {
  const {
    reference = QUOTE_BRAND.defaultReference,
    customer = {},
    contact = QUOTE_BRAND.defaultContact,
    lines = [],
    shipping = 0,
    subtotal = 0,
    createdAt = new Date(),
  } = quoteData;

  const localeDefaults = localeForCountry(customer.country);
  const currency = quoteData.currency || localeDefaults.currency;
  const locale = localeDefaults.locale;
  const vatRate =
    typeof quoteData.vatRate === "number"
      ? quoteData.vatRate
      : localeDefaults.vatRate;
  const money = makeMoneyFormatter(currency, locale);

  const net = (Number(subtotal) || 0) + (Number(shipping) || 0);
  const vat = net * vatRate;
  const grandTotal = net + vat;

  // ── Header: brand + QUOTATION meta ─────────────────────────────────────
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          cell(
            [
              para(run(QUOTE_BRAND.companyName, { bold: true, size: 30, color: GREEN }), {
                after: 20,
              }),
              para(run(QUOTE_BRAND.tagline, { size: 15, color: GRAY })),
              para(run(QUOTE_BRAND.website, { size: 14, color: GRAY })),
            ],
            { width: 55, borders: NO_BORDERS }
          ),
          cell(
            [
              para(run("OFFER", { bold: true, size: 40, color: NAVY }), {
                after: 20,
                alignment: AlignmentType.RIGHT,
              }),
              para(run(`Quote No: ${reference}`, { size: 17, color: GRAY }), {
                after: 10,
                alignment: AlignmentType.RIGHT,
              }),
              para(
                run(`Date: ${fmtDate(createdAt)}`, { size: 17, color: GRAY }),
                { after: 10, alignment: AlignmentType.RIGHT }
              ),
              para(
                run(`Valid until: ${fmtDate(addDays(createdAt, 30))}`, {
                  size: 17,
                  color: GRAY,
                }),
                { alignment: AlignmentType.RIGHT }
              ),
            ],
            { width: 45, borders: NO_BORDERS }
          ),
        ],
      }),
    ],
  });

  // ── FROM / TO ──────────────────────────────────────────────────────────
  const fromTo = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          cell(
            [
              para(run("FROM", { bold: true, size: 15, color: GREEN })),
              para(run(QUOTE_BRAND.companyName, { bold: true, size: 19 })),
              para(run(QUOTE_BRAND.address, { size: 17, color: GRAY })),
              para(run(QUOTE_BRAND.website, { size: 17, color: GRAY })),
              para(run(QUOTE_BRAND.email, { size: 17, color: GRAY })),
              ...(QUOTE_BRAND.phone
                ? [para(run(QUOTE_BRAND.phone, { size: 17, color: GRAY }))]
                : []),
            ],
            { width: 50, borders: NO_BORDERS }
          ),
          cell(
            [
              para(run("TO", { bold: true, size: 15, color: GREEN })),
              para(run(customer.name || "—", { bold: true, size: 19 })),
              ...(contact.name
                ? [para(run(contact.name, { size: 17, color: GRAY }))]
                : []),
              ...([customer.address, customer.city, customer.country]
                .filter(Boolean)
                .map((l) => para(run(l, { size: 17, color: GRAY })))),
              ...(contact.email
                ? [para(run(contact.email, { size: 17, color: GRAY }))]
                : []),
              ...(contact.phone
                ? [para(run(contact.phone, { size: 17, color: GRAY }))]
                : []),
            ],
            { width: 50, borders: NO_BORDERS }
          ),
        ],
      }),
    ],
  });

  // ── ITEMS TABLE ──────────────────────────────────────────────────────
  const headerFill = GREEN;
  const itemHeaderRow = new TableRow({
    tableHeader: true,
    children: [
      cell(para(run("#", { bold: true, size: 16, color: WHITE })), {
        width: 6,
        fill: headerFill,
        borders: NO_BORDERS,
      }),
      cell(para(run("DESCRIPTION", { bold: true, size: 16, color: WHITE })), {
        width: 40,
        fill: headerFill,
        borders: NO_BORDERS,
      }),
      cell(para(run("D × L (MM)", { bold: true, size: 16, color: WHITE })), {
        width: 20,
        fill: headerFill,
        borders: NO_BORDERS,
      }),
      cell(para(run("QTY", { bold: true, size: 16, color: WHITE })), {
        width: 10,
        fill: headerFill,
        borders: NO_BORDERS,
      }),
      cell(
        para(run("UNIT PRICE", { bold: true, size: 16, color: WHITE }), {
          alignment: AlignmentType.RIGHT,
        }),
        { width: 12, fill: headerFill, borders: NO_BORDERS }
      ),
      cell(
        para(run("TOTAL", { bold: true, size: 16, color: WHITE }), {
          alignment: AlignmentType.RIGHT,
        }),
        { width: 12, fill: headerFill, borders: NO_BORDERS }
      ),
    ],
  });

  const itemRows = lines.map((ql, i) => {
    const qty = ql.quantity || 1;
    const unitPrice = qty > 0 ? (ql.lineTotal || 0) / qty : ql.lineTotal || 0;
    const fill = i % 2 === 1 ? GREEN_LIGHT : WHITE;
    return new TableRow({
      children: [
        cell(para(run(String(i + 1), { size: 17 })), { width: 6, fill }),
        cell(para(run(ql.productName || ql.productId || "—", { size: 17 })), {
          width: 40,
          fill,
        }),
        cell(
          para(run(`${ql.lengthMm || "—"} x ${ql.heightMm || "—"}`, { size: 17 })),
          { width: 20, fill }
        ),
        cell(para(run(`${qty} pcs`, { size: 17 })), { width: 10, fill }),
        cell(
          para(run(money(unitPrice), { size: 17 }), {
            alignment: AlignmentType.RIGHT,
          }),
          { width: 12, fill }
        ),
        cell(
          para(run(money(ql.lineTotal), { bold: true, size: 17 }), {
            alignment: AlignmentType.RIGHT,
          }),
          { width: 12, fill }
        ),
      ],
    });
  });

  const itemsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [itemHeaderRow, ...itemRows],
  });

  // ── TOTALS ─────────────────────────────────────────────────────────────
  function totalsRow(label, value, opts = {}) {
    return new TableRow({
      children: [
        cell(
          para(run(label, { bold: opts.bold, size: 17, color: opts.color || GRAY }), {
            alignment: AlignmentType.RIGHT,
          }),
          { width: 75, fill: opts.fill, borders: NO_BORDERS }
        ),
        cell(
          para(
            run(value, { bold: opts.bold, size: opts.big ? 21 : 17, color: opts.color || NAVY }),
            { alignment: AlignmentType.RIGHT }
          ),
          { width: 25, fill: opts.fill, borders: NO_BORDERS }
        ),
      ],
    });
  }

  const totalsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      totalsRow("Subtotal", money(Number(subtotal) || 0)),
      totalsRow("Delivery", money(Number(shipping) || 0)),
      totalsRow(`VAT (${Math.round(vatRate * 100)}%)`, money(vat)),
      totalsRow("Total (incl. VAT)", money(grandTotal), {
        bold: true,
        big: true,
        color: WHITE,
        fill: GREEN,
      }),
    ],
  });

  // ── SPECIFICATIONS ───────────────────────────────────────────────────
  const totalQty = lines.reduce((s, l) => s + (l.quantity || 1), 0);
  const productNames = [
    ...new Set(lines.map((l) => l.productName || l.productId).filter(Boolean)),
  ].join(", ");
  const dimsList = [
    ...new Set(lines.map((l) => `${l.lengthMm} x ${l.heightMm}`)),
  ].join(" · ");
  const specs = [
    ["Catalog", QUOTE_BRAND.catalogLabel],
    ["Products", productNames || "—"],
    ["Dimensions (D × L)", dimsList || "—"],
    ["Quantity", `${totalQty} pcs`],
    ["Delivery", customer.country ? `Delivery to ${customer.country}` : "To be confirmed"],
  ];

  const terms = [
    ...(QUOTE_BRAND.termsDocx || QUOTE_BRAND.terms),
    `Prices in ${currency}. Valid until the date above.`,
    QUOTE_BRAND.warrantyNoteDocx || QUOTE_BRAND.warrantyNote,
  ];

  function sectionHeading(text) {
    return new Paragraph({
      spacing: { before: 220, after: 80 },
      children: [run(text, { bold: true, size: 18, color: GREEN })],
    });
  }

  const doc = new Document({
    title: `Quotation ${reference}`,
    creator: QUOTE_BRAND.companyName,
    description: `purolat.com quotation ${reference}`,
    sections: [
      {
        properties: {
          page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } },
        },
        children: [
          headerTable,
          new Paragraph({
            spacing: { before: 120, after: 120 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 12, color: GREEN },
            },
            children: [],
          }),
          fromTo,
          sectionHeading("ITEMS"),
          itemsTable,
          new Paragraph({ spacing: { after: 120 }, children: [] }),
          totalsTable,
          sectionHeading("SPECIFICATIONS"),
          ...specs.map(
            ([k, v]) =>
              new Paragraph({
                spacing: { after: 40 },
                children: [
                  run(`${k}:  `, { bold: true, size: 17 }),
                  run(v, { size: 17, color: GRAY }),
                ],
              })
          ),
          sectionHeading("TERMS & CONDITIONS"),
          ...terms.map(
            (t) =>
              new Paragraph({
                spacing: { after: 40 },
                bullet: { level: 0 },
                children: [run(t, { size: 16, color: GRAY })],
              })
          ),
          new Paragraph({ spacing: { before: 240 }, children: [] }),
          para(run("Best regards,", { bold: true, size: 18 })),
          para(run(`${QUOTE_BRAND.companyName}`, { bold: true, size: 18, color: GREEN })),
          new Paragraph({
            spacing: { before: 200 },
            children: [
              run(
                `${QUOTE_BRAND.companyName} — ${QUOTE_BRAND.website}`,
                { size: 14, color: GRAY }
              ),
            ],
          }),
          para(run(QUOTE_BRAND.catalogLabel, { size: 13, color: GRAY })),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const friendlyName = customer.name
    ? `Quotation_${customer.name.replace(/\s+/g, "_")}_${reference}.docx`
    : `Quotation_${reference}.docx`;

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
