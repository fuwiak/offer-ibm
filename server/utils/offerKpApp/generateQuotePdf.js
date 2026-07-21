const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const createFilesLib = require("../agents/aibitat/plugins/create-files/lib");
const { QUOTE_BRAND, localeForCountry } = require("./quoteBrand");
const { toPdfSafeText } = require("./pdfText");

/** Neutral B&W commercial offer — synced with QuotePreview / DOCX columns. */
const BLACK = rgb(0.12, 0.12, 0.12);
const GRAY = rgb(0.4, 0.4, 0.4);
const MUTED = rgb(0.55, 0.55, 0.55);
const LIGHT = rgb(0.96, 0.96, 0.96);
const LINE = rgb(0.82, 0.82, 0.82);
const WHITE = rgb(1, 1, 1);
const HEADER_BG = rgb(0.22, 0.22, 0.22);

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
 * Generate quotation PDF — same data/columns as Сводка / Превью КП / DOCX.
 * Neutral white page (Helvetica cannot render Cyrillic → Latin labels).
 */
async function generateQuotePdf(quoteData) {
  const {
    reference = QUOTE_BRAND.defaultReference,
    customer = {},
    lines = [],
    shipping = 0,
    subtotal = 0,
    createdAt = new Date(),
    doc: docOverrides = {},
  } = quoteData;

  const { currency, vatRate: localeVatRate } = localeForCountry(
    customer.country
  );
  const vatRate =
    typeof quoteData.vatRate === "number"
      ? quoteData.vatRate
      : typeof docOverrides.vatRate === "number"
        ? docOverrides.vatRate
        : localeVatRate;
  const fmtMoney = (num) => `${Number(num || 0).toFixed(2)} ${currency}`;

  const computedSubtotal =
    Number(subtotal) ||
    lines.reduce((sum, ql) => sum + lineNetTotal(ql, vatRate), 0);
  const ship = Number(shipping) || 0;
  const net = computedSubtotal + ship;
  const vat = net * vatRate;
  const grandTotal = net + vat;

  const brandCompany = toPdfSafeText(
    docOverrides.brandCompany || QUOTE_BRAND.companyNameLatin || "Purolat"
  );
  const brandTagline = toPdfSafeText(
    docOverrides.brandTagline || QUOTE_BRAND.taglineLatin
  );
  const brandWebsite = toPdfSafeText(
    docOverrides.brandWebsite || QUOTE_BRAND.website
  );
  const title = toPdfSafeText(
    docOverrides.title || "COMMERCIAL OFFER"
  ).replace(/КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ/i, "COMMERCIAL OFFER");
  const supplierCompany = toPdfSafeText(
    docOverrides.supplierCompany || QUOTE_BRAND.companyNameLatin || "Purolat"
  );
  const supplierAddress = toPdfSafeText(
    docOverrides.supplierAddress || QUOTE_BRAND.address
  );
  const supplierWebsite = toPdfSafeText(
    docOverrides.supplierWebsite || QUOTE_BRAND.website
  );
  const supplierEmail = toPdfSafeText(
    docOverrides.supplierEmail || QUOTE_BRAND.email || ""
  );
  const validUntil = docOverrides.validUntil
    ? new Date(docOverrides.validUntil)
    : addDays(createdAt, 30);

  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pg = pdfDoc.addPage([595.28, 841.89]);
  const W = pg.getWidth();
  const H = pg.getHeight();
  const L = 40;
  const R = W - 40;
  const CW = R - L;

  function txt(
    text,
    x,
    y,
    { font = regular, size = 9, color = BLACK, maxWidth } = {}
  ) {
    if (!text && text !== 0) return;
    const str = toPdfSafeText(String(text));
    if (maxWidth) {
      const words = str.split(" ");
      let line = "";
      let cy = y;
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
          pg.drawText(line, { x, y: cy, size, font, color });
          line = w;
          cy -= size * 1.35;
        } else {
          line = test;
        }
      }
      if (line) pg.drawText(line, { x, y: cy, size, font, color });
      return;
    }
    pg.drawText(str, { x, y, size, font, color });
  }

  function rightAlign(text, rightX, y, opts = {}) {
    const { font = regular, size = 9, color = BLACK } = opts;
    const str = toPdfSafeText(String(text));
    const w = font.widthOfTextAtSize(str, size);
    txt(str, rightX - w, y, { font, size, color });
  }

  function hline(y, color = LINE, thickness = 0.6) {
    pg.drawLine({
      start: { x: L, y },
      end: { x: R, y },
      thickness,
      color,
    });
  }

  let y = H - 36;

  // Header
  txt(brandCompany, L, y, { font: bold, size: 14, color: BLACK });
  rightAlign(title, R, y, { font: bold, size: 12, color: BLACK });
  y -= 12;
  txt(brandTagline, L, y, { size: 7.5, color: MUTED });
  rightAlign(`No. ${reference}`, R, y, { size: 8.5, color: GRAY });
  y -= 10;
  txt(brandWebsite, L, y, { size: 7.5, color: MUTED });
  rightAlign(`Date: ${fmtDate(createdAt)}`, R, y, { size: 8.5, color: GRAY });
  y -= 10;
  rightAlign(`Valid until: ${fmtDate(validUntil)}`, R, y, {
    size: 8.5,
    color: GRAY,
  });
  y -= 14;
  hline(y, BLACK, 1);
  y -= 18;

  // Parties
  const midX = L + CW / 2 + 12;
  const partyY = y;
  txt("SUPPLIER", L, y, { font: bold, size: 7.5, color: MUTED });
  txt("CUSTOMER", midX, y, { font: bold, size: 7.5, color: MUTED });
  y -= 12;
  txt(supplierCompany, L, y, { font: bold, size: 10 });
  txt(toPdfSafeText(customer.name || "—"), midX, y, {
    font: bold,
    size: 10,
  });
  y -= 11;
  txt(supplierAddress, L, y, { size: 8, color: GRAY });
  if (customer.country) {
    txt(toPdfSafeText(customer.country), midX, y, { size: 8, color: GRAY });
  }
  y -= 10;
  txt(supplierWebsite, L, y, { size: 8, color: GRAY });
  y -= 10;
  if (supplierEmail) {
    txt(supplierEmail, L, y, { size: 8, color: GRAY });
    y -= 10;
  }
  y = Math.min(y, partyY - 48) - 8;
  hline(y);
  y -= 16;

  // Section
  txt(
    toPdfSafeText(
      docOverrides.positionsLabel ||
        `CATALOG ITEMS · ${QUOTE_BRAND.catalogLabel}`
    ),
    L,
    y,
    { font: bold, size: 8, color: MUTED }
  );
  y -= 12;

  // Table columns: Position | Article | Qty | Unit | Sum
  const COL = {
    name: L,
    article: L + CW * 0.42,
    qty: L + CW * 0.62,
    unit: L + CW * 0.72,
    sum: L + CW * 0.86,
  };
  const headerH = 16;
  pg.drawRectangle({
    x: L,
    y: y - headerH,
    width: CW,
    height: headerH,
    color: HEADER_BG,
  });
  const hy = y - 11;
  txt("POSITION", COL.name + 4, hy, { font: bold, size: 7, color: WHITE });
  txt("ARTICLE", COL.article + 2, hy, { font: bold, size: 7, color: WHITE });
  rightAlign("QTY", COL.unit - 4, hy, { font: bold, size: 7, color: WHITE });
  rightAlign("PRICE/PC", COL.sum - 4, hy, {
    font: bold,
    size: 7,
    color: WHITE,
  });
  rightAlign("SUM", R - 4, hy, { font: bold, size: 7, color: WHITE });
  y -= headerH;

  for (let i = 0; i < lines.length; i++) {
    const ql = lines[i];
    const rowH = 15;
    if (y - rowH < 72) {
      // simple: stop adding if page full (rare for typical quotes)
      break;
    }
    if (i % 2 === 1) {
      pg.drawRectangle({
        x: L,
        y: y - rowH,
        width: CW,
        height: rowH,
        color: LIGHT,
      });
    }
    const qty = Number(ql.quantity) || 0;
    const unit = lineUnitNet(ql, vatRate);
    const sum = lineNetTotal(ql, vatRate);
    const ry = y - 10;
    txt(toPdfSafeText(lineName(ql)).slice(0, 42), COL.name + 4, ry, {
      size: 8,
      maxWidth: COL.article - COL.name - 8,
    });
    txt(toPdfSafeText(lineArticle(ql)).slice(0, 16), COL.article + 2, ry, {
      size: 8,
    });
    rightAlign(String(qty), COL.unit - 4, ry, { size: 8 });
    rightAlign(Number(unit) > 0 ? fmtMoney(unit) : "—", COL.sum - 4, ry, {
      size: 8,
    });
    rightAlign(Number(sum) > 0 ? fmtMoney(sum) : "—", R - 4, ry, {
      font: bold,
      size: 8,
    });
    y -= rowH;
  }

  y -= 14;
  hline(y);
  y -= 14;

  // Totals
  const totalsX = R - 200;
  txt("Subtotal", totalsX, y, { size: 8.5, color: GRAY });
  rightAlign(fmtMoney(computedSubtotal), R - 2, y, { size: 8.5 });
  y -= 12;
  txt("Delivery", totalsX, y, { size: 8.5, color: GRAY });
  rightAlign(fmtMoney(ship), R - 2, y, { size: 8.5 });
  y -= 12;
  txt(`VAT (${Math.round(vatRate * 100)}%)`, totalsX, y, {
    size: 8.5,
    color: GRAY,
  });
  rightAlign(fmtMoney(vat), R - 2, y, { size: 8.5 });
  y -= 8;
  hline(y);
  y -= 4;
  pg.drawRectangle({
    x: totalsX - 8,
    y: y - 18,
    width: R - totalsX + 8,
    height: 18,
    color: HEADER_BG,
  });
  txt("TOTAL incl. VAT", totalsX, y - 12, {
    font: bold,
    size: 9,
    color: WHITE,
  });
  rightAlign(fmtMoney(grandTotal), R - 4, y - 12, {
    font: bold,
    size: 10,
    color: WHITE,
  });
  y -= 32;

  // Terms
  txt("TERMS", L, y, { font: bold, size: 8, color: MUTED });
  y -= 11;
  const terms = (
    docOverrides.terms || [
      "Payment and shipment — as agreed with purolat.com sales.",
      "Offer valid 30 days from document date.",
      `Prices in ${currency}; items from ${QUOTE_BRAND.catalogLabel} catalog.`,
      toPdfSafeText(QUOTE_BRAND.warrantyNote),
    ]
  ).slice(0, 6);
  for (const t of terms) {
    txt(`• ${toPdfSafeText(String(t).replace("{currency}", currency))}`, L, y, {
      size: 7.5,
      color: GRAY,
      maxWidth: CW,
    });
    y -= 11;
  }

  y -= 10;
  txt(
    toPdfSafeText(docOverrides.signOff || "Best regards,"),
    L,
    y,
    { font: bold, size: 9 }
  );
  y -= 12;
  txt(
    toPdfSafeText(
      docOverrides.signCompany || QUOTE_BRAND.companyNameLatin || "Purolat"
    ),
    L,
    y,
    { size: 8.5, color: GRAY }
  );

  const pdfBytes = await pdfDoc.save();
  const friendlyName = customer.name
    ? `KP_${toPdfSafeText(customer.name).replace(/\s+/g, "_")}_${reference}.pdf`
    : `KP_${reference}.pdf`;

  const saved = await createFilesLib.saveGeneratedFile({
    fileType: "quote",
    extension: "pdf",
    buffer: Buffer.from(pdfBytes),
    displayFilename: friendlyName,
  });

  return {
    filename: saved.displayFilename,
    storageFilename: saved.filename,
    filePath: saved.storagePath,
    fileSize: saved.fileSize,
  };
}

module.exports = { generateQuotePdf };
