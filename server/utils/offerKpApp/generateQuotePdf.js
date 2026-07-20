const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const createFilesLib = require("../agents/aibitat/plugins/create-files/lib");
const { QUOTE_BRAND, localeForCountry } = require("./quoteBrand");
const { toPdfSafeText } = require("./pdfText");

const NAVY = rgb(0.08, 0.13, 0.28);
const WHITE = rgb(1, 1, 1);
const DARK = rgb(0.08, 0.08, 0.08);
const GRAY = rgb(0.45, 0.45, 0.45);
const LIGHT_GRAY = rgb(0.94, 0.94, 0.94);
const MID_GRAY = rgb(0.72, 0.72, 0.72);
const NAVY_LIGHT = rgb(0.55, 0.62, 0.78);
const AMBER = rgb(0.72, 0.38, 0.04);
const AMBER_BG = rgb(1, 0.97, 0.9);
const TABLE_HEADER_TEXT = rgb(0.82, 0.86, 0.93);

function fmtDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("fr-FR");
}

/**
 * Generate a professional offer-kp quotation PDF.
 *
 * @param {object} quoteData
 * @param {string}  quoteData.reference
 * @param {object}  quoteData.customer   { name, country, city, productLine }
 * @param {object}  quoteData.contact    { name, email, phone }
 * @param {Array}   quoteData.lines      calculated quote lines from calculateQuote()
 * @param {number}  quoteData.shipping
 * @param {number}  quoteData.subtotal
 * @param {number}  quoteData.total
 * @param {Date|string} quoteData.createdAt
 * @returns {Promise<{filename: string, storageFilename: string, filePath: string, fileSize: number}>}
 */
async function generateQuotePdf(quoteData) {
  const {
    reference = QUOTE_BRAND.defaultReference,
    customer = {},
    contact = QUOTE_BRAND.defaultContact,
    lines = [],
    shipping = 0,
    subtotal = 0,
    total = 0,
    createdAt = new Date(),
  } = quoteData;

  const { currency } = localeForCountry(customer.country);
  // PDF standard fonts (WinAnsi) — ASCII-only amounts + ISO currency code
  const fmtMoney = (num) => `${Number(num || 0).toFixed(2)} ${currency}`;

  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const oblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Helpers scoped per page
  function makePage() {
    const pg = pdfDoc.addPage([595.28, 841.89]);
    const W = pg.getWidth();
    const H = pg.getHeight();
    const L = 38;
    const R = W - 38;
    const CW = R - L;

    function txt(
      text,
      x,
      y,
      { font = regular, size = 8.5, color = DARK, maxWidth } = {}
    ) {
      if (!text) return;
      const str = toPdfSafeText(text);
      if (maxWidth) {
        // naive word-wrap
        const words = str.split(" ");
        let line = "";
        let cy = y;
        for (const w of words) {
          const test = line ? `${line} ${w}` : w;
          if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
            pg.drawText(line, { x, y: cy, size, font, color });
            line = w;
            cy -= size * 1.4;
          } else {
            line = test;
          }
        }
        if (line) pg.drawText(line, { x, y: cy, size, font, color });
      } else {
        pg.drawText(str, { x, y, size, font, color });
      }
    }

    function rect(x, y, w, h, { color = NAVY } = {}) {
      pg.drawRectangle({ x, y, width: w, height: h, color });
    }

    function line(x1, y1, x2, y2, { thickness = 0.5, color = MID_GRAY } = {}) {
      pg.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness,
        color,
      });
    }

    function rightAlign(text, rightX, y, opts = {}) {
      const { font = regular, size = 8.5, color = DARK } = opts;
      const w = font.widthOfTextAtSize(String(text), size);
      txt(text, rightX - w, y, { font, size, color });
    }

    return { pg, W, H, L, R, CW, txt, rect, line, rightAlign };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PAGE 1
  // ═══════════════════════════════════════════════════════════════════
  const { H, L, R, CW, txt, rect, line, rightAlign } = makePage();
  let y = H - 28;

  // Company info — top right
  const companyX = R - 180;
  txt(QUOTE_BRAND.companyNameLatin, companyX, y, {
    font: bold,
    size: 8,
    color: DARK,
  });
  txt(QUOTE_BRAND.address, companyX, y - 11, { size: 7.5, color: GRAY });
  txt(QUOTE_BRAND.website, companyX, y - 21, { size: 7.5, color: GRAY });
  if (QUOTE_BRAND.email) {
    txt(QUOTE_BRAND.email, companyX, y - 31, { size: 7.5, color: GRAY });
  }

  txt("PUROLAT", L, y, { font: bold, size: 22, color: NAVY });
  txt(QUOTE_BRAND.taglineLatin.toUpperCase(), L, y - 14, {
    size: 6,
    color: GRAY,
  });
  txt(QUOTE_BRAND.catalogLabel, L, y - 22, { size: 6, color: GRAY });

  y -= 38;
  line(L, y, R, y, { thickness: 0.8, color: NAVY });
  y -= 2;

  // ── QUOTATION banner ──────────────────────────────────────────────
  const bannerH = 30;
  rect(L, y - bannerH, CW, bannerH, { color: NAVY });
  txt("COMMERCIAL OFFER", L + 14, y - 19, {
    font: bold,
    size: 14,
    color: WHITE,
  });
  txt(
    `${QUOTE_BRAND.catalogLabel} · ${QUOTE_BRAND.taglineLatin}`,
    L + 14,
    y - 27,
    {
      size: 7,
      color: TABLE_HEADER_TEXT,
    }
  );
  y -= bannerH + 14;

  // ── Customer + Quote Reference ────────────────────────────────────
  const midX = L + CW / 2 + 15;
  const sectionY = y;

  // Left column — Customer
  txt("CUSTOMER", L, y, { font: bold, size: 7.5, color: NAVY });
  y -= 14;
  txt(customer.name || "—", L, y, { font: bold, size: 10 });
  y -= 13;
  if (customer.city) {
    txt(customer.city, L, y, { size: 8.5 });
    y -= 11;
  }
  txt(customer.country || "", L, y, { size: 8.5 });
  y -= 11;
  if (customer.productLine) {
    txt(customer.productLine, L, y, { font: oblique, size: 8, color: GRAY });
    y -= 11;
  }

  // Right column — Quote reference
  let ry = sectionY;
  txt("QUOTE REFERENCE", midX, ry, { font: bold, size: 7.5, color: NAVY });
  ry -= 4;
  rightAlign(reference, R, ry, { font: bold, size: 13, color: NAVY });
  ry -= 16;
  txt(`Date: ${fmtDate(createdAt)}`, midX, ry, { size: 8.5 });
  ry -= 12;
  txt("Validity: 30 days", midX, ry, { size: 8.5 });
  ry -= 12;
  txt(
    "Payment: 50% deposit, balance before shipment — Bank transfer",
    midX,
    ry,
    {
      size: 7.5,
      color: GRAY,
      maxWidth: R - midX - 5,
    }
  );
  ry -= 22;
  txt(`Contact: ${contact.name}`, midX, ry, { font: bold, size: 8 });
  ry -= 12;
  txt(contact.email, midX, ry, { size: 8, color: GRAY });
  ry -= 12;
  txt(`Tel: ${contact.phone}`, midX, ry, { size: 8, color: GRAY });

  y = Math.min(y, ry) - 16;
  line(L, y, R, y, { thickness: 0.8, color: NAVY });
  y -= 14;

  // ── Products ──────────────────────────────────────────────────────
  // Group lines by product name
  const groups = groupLinesByProduct(lines);

  for (const group of groups) {
    const { productName, composition, groupLines, totalQty } = group;

    // Product header bar
    rect(L, y - 22, CW, 22, { color: NAVY });
    txt(productName, L + 10, y - 14, { font: bold, size: 9, color: WHITE });
    if (composition) {
      txt(composition, L + 10, y - 22 + 5, {
        size: 7,
        color: TABLE_HEADER_TEXT,
      });
    }
    rightAlign(`${totalQty} units`, R - 6, y - 14, {
      font: bold,
      size: 9,
      color: WHITE,
    });
    y -= 22 + 1;

    // Table header
    rect(L, y - 14, CW, 14, { color: rgb(0.18, 0.24, 0.42) });
    const COL = tableColumns(L, R);
    txt("N°", COL.num + 2, y - 10, {
      font: bold,
      size: 7,
      color: TABLE_HEADER_TEXT,
    });
    txt("PRODUCT", COL.product + 2, y - 10, {
      font: bold,
      size: 7,
      color: TABLE_HEADER_TEXT,
    });
    txt("D × L (MM)", COL.dims + 2, y - 10, {
      font: bold,
      size: 7,
      color: TABLE_HEADER_TEXT,
    });
    txt("SPEC", COL.area + 2, y - 10, {
      font: bold,
      size: 7,
      color: TABLE_HEADER_TEXT,
    });
    txt("QTY", COL.qty + 2, y - 10, {
      font: bold,
      size: 7,
      color: TABLE_HEADER_TEXT,
    });
    txt("UNIT PRICE", COL.unitPrice + 2, y - 10, {
      font: bold,
      size: 7,
      color: TABLE_HEADER_TEXT,
    });
    txt("TOTAL", COL.total + 2, y - 10, {
      font: bold,
      size: 7,
      color: TABLE_HEADER_TEXT,
    });
    y -= 14;

    // Table rows
    let rowNum = 1;
    for (const ql of groupLines) {
      const rowH = 14;
      const isEven = rowNum % 2 === 0;
      if (isEven) rect(L, y - rowH, CW, rowH, { color: LIGHT_GRAY });

      const qty = ql.quantity || 1;
      const unitPrice =
        ql.unitPrice ?? (qty > 0 ? (ql.lineTotal || 0) / qty : 0);
      const dims = `${ql.lengthMm} × ${ql.heightMm}`;
      const spec = ql.spec || "DIN/GOST";

      txt(String(rowNum), COL.num + 4, y - 10, { size: 8 });
      txt(ql.productName || productName, COL.product + 2, y - 10, { size: 8 });
      txt(dims, COL.dims + 2, y - 10, { size: 8 });
      txt(spec, COL.area + 2, y - 10, { size: 7 });
      txt(String(qty), COL.qty + 2, y - 10, { size: 8 });
      const hasPrice = Number(unitPrice) > 0;
      rightAlign(
        hasPrice ? fmtMoney(unitPrice) : "on request",
        COL.total - 2,
        y - 10,
        {
          size: 8,
        }
      );
      rightAlign(hasPrice ? fmtMoney(ql.lineTotal) : "—", R - 4, y - 10, {
        size: 8,
      });
      y -= rowH;
      rowNum++;
    }
    y -= 8;
  }

  // ── Totals ────────────────────────────────────────────────────────
  const totalsX = R - 220;
  const totalsW = 220;
  line(L, y, R, y, { thickness: 0.5 });
  y -= 4;

  // Footnote annotations left
  const footNoteLines = buildFootnotes(lines);
  let fnY = y;
  for (const fn of footNoteLines) {
    txt(fn, L, fnY, { size: 7, color: GRAY });
    fnY -= 10;
  }

  // Subtotal row
  txt("Subtotal excl. VAT", totalsX, y, { size: 8.5, color: GRAY });
  rightAlign(fmtMoney(subtotal), R - 4, y, { font: bold, size: 8.5 });
  y -= 13;

  // Shipping row
  const shippingLabel = customer.country
    ? `Delivery to ${customer.country}`
    : "Delivery";
  txt(shippingLabel, totalsX, y, { size: 8.5, color: GRAY });
  rightAlign(fmtMoney(shipping), R - 4, y, { size: 8.5 });
  y -= 6;

  line(totalsX, y, R, y, { thickness: 0.5, color: NAVY });
  y -= 4;

  // TOTAL row
  rect(totalsX, y - 18, totalsW, 18, { color: NAVY });
  txt("TOTAL excl. VAT", totalsX + 8, y - 12, {
    font: bold,
    size: 9,
    color: WHITE,
  });
  rightAlign(fmtMoney(total), R - 6, y - 12, {
    font: bold,
    size: 11,
    color: WHITE,
  });
  y -= 28;

  // No VAT note
  txt(
    "No VAT applied (intra-EU B2B with valid VAT number). Payment terms: 50% deposit, 50% before shipment.",
    L,
    y,
    { size: 7.5, color: GRAY, maxWidth: totalsX - L - 10 }
  );
  y -= 24;

  // ── Important notice ──────────────────────────────────────────────
  const noticeH = 30;
  rect(L, y - noticeH, CW, noticeH, { color: AMBER_BG });
  pdfDoc.getPage(0).drawRectangle({
    x: L,
    y: y - noticeH,
    width: CW,
    height: noticeH,
    borderColor: AMBER,
    borderWidth: 1,
    color: AMBER_BG,
  });
  txt("IMPORTANT:", L + 8, y - 12, { font: bold, size: 8, color: AMBER });
  txt(
    "Please carefully verify all dimensions and quantities in this document before confirming your order. Once the order is validated, the responsibility for dimensions and quantities lies with the customer.",
    L + 8,
    y - 22,
    { size: 7, color: DARK, maxWidth: CW - 16 }
  );
  y -= noticeH + 12;

  // ── Accepted & Approved ───────────────────────────────────────────
  rect(L, y - 44, CW, 44, { color: NAVY });
  const aaText = "ACCEPTED & APPROVED";
  const aaW = bold.widthOfTextAtSize(aaText, 12);
  txt(aaText, L + CW / 2 - aaW / 2, y - 18, {
    font: bold,
    size: 12,
    color: WHITE,
  });
  const subAaText = "Read and approved — Order confirmed";
  const subAaW = oblique.widthOfTextAtSize(subAaText, 8.5);
  txt(subAaText, L + CW / 2 - subAaW / 2, y - 31, {
    font: oblique,
    size: 8.5,
    color: TABLE_HEADER_TEXT,
  });
  txt(
    "Signature and stamp",
    L + CW / 2 - oblique.widthOfTextAtSize("Signature and stamp", 7.5) / 2,
    y - 41,
    {
      font: oblique,
      size: 7.5,
      color: NAVY_LIGHT,
    }
  );
  y -= 56;

  // ── Terms & Conditions Extract ────────────────────────────────────
  txt("General Terms & Conditions (Extract)", L, y, { font: bold, size: 8.5 });
  y -= 12;
  const terms = QUOTE_BRAND.terms;
  for (const t of terms) {
    txt(t, L, y, { size: 7, color: GRAY, maxWidth: CW });
    y -= 14;
  }
  y -= 4;

  // ── Bottom footer bar ─────────────────────────────────────────────
  rect(L, y - 20, CW, 20, { color: NAVY });
  const footerText = QUOTE_BRAND.footerLine;
  const ftW = regular.widthOfTextAtSize(footerText, 7.5);
  txt(footerText, L + CW / 2 - ftW / 2, y - 13, {
    size: 7.5,
    color: TABLE_HEADER_TEXT,
  });
  txt(
    QUOTE_BRAND.website,
    L + CW / 2 - regular.widthOfTextAtSize(QUOTE_BRAND.website, 6.5) / 2,
    y - 21 + 4,
    { size: 6.5, color: NAVY_LIGHT }
  );

  const pdfBytes = await pdfDoc.save();
  const friendlyName = customer.name
    ? `Quotation_${toPdfSafeText(customer.name).replace(/\s+/g, "_")}_${reference}.pdf`
    : `Quotation_${reference}.pdf`;

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

function tableColumns(L, R) {
  const CW = R - L;
  return {
    num: L,
    product: L + 22,
    dims: L + CW * 0.3,
    area: L + CW * 0.5,
    qty: L + CW * 0.63,
    unitPrice: L + CW * 0.73,
    total: L + CW * 0.88,
  };
}

function groupLinesByProduct(lines) {
  const map = new Map();
  for (const l of lines) {
    const key = l.productName || l.productId || "Product";
    if (!map.has(key)) {
      map.set(key, {
        productName: key,
        composition: null,
        groupLines: [],
        groupTotal: 0,
        totalQty: 0,
      });
    }
    const g = map.get(key);
    g.groupLines.push(l);
    g.groupTotal += l.lineTotal || 0;
    g.totalQty += l.quantity || 1;
  }
  return Array.from(map.values());
}

function buildFootnotes(lines) {
  const fns = [];
  const totalQty = lines.reduce((s, l) => s + (l.quantity || 1), 0);
  const productNames = [
    ...new Set(lines.map((l) => l.productName || l.productId)),
  ].join(", ");
  fns.push(
    `Catalog: ${QUOTE_BRAND.catalogLabel} · ${totalQty} pcs · ${productNames}`
  );
  const analogCount = lines.filter((l) => l.matchType === "analog").length;
  const notFoundCount = lines.filter(
    (l) => !(Number(l.unitPrice) > 0) && !(Number(l.lineTotal) > 0)
  ).length;
  if (analogCount > 0) {
    fns.push(
      `ANALOG (${analogCount}): requested item not in catalog, equivalent offered — see SPEC column`
    );
  }
  if (notFoundCount > 0) {
    fns.push(
      `NOT IN CATALOG (${notFoundCount}): no such product — price on request`
    );
  }
  fns.push("Offer valid 30 days · Prices per catalog at quote date");
  fns.push(QUOTE_BRAND.warrantyNote);
  return fns;
}

module.exports = { generateQuotePdf };
