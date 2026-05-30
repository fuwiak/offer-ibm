const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const path = require("path");
const fs = require("fs/promises");
const { v4: uuidv4 } = require("uuid");

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

function fmtEur(num) {
  return (
    new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num) + " €"
  );
}

function fmtNum(num, decimals = 3) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

function fmtDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("fr-FR");
}

function storageDir() {
  return path.join(
    process.env.STORAGE_DIR || path.resolve(__dirname, "../../storage"),
    "generated-files"
  );
}

/**
 * Generate a professional lawyer-revizorro quotation PDF.
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
    reference = "AV-0000",
    customer = {},
    contact = {
      name: "Dorothée Benamar",
      email: "dorothee.benamar@alliaverre.com",
      phone: "+33 3 22 47 47 55",
    },
    lines = [],
    shipping = 0,
    subtotal = 0,
    total = 0,
    createdAt = new Date(),
  } = quoteData;

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

    function txt(text, x, y, { font = regular, size = 8.5, color = DARK, maxWidth } = {}) {
      if (!text) return;
      const str = String(text);
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
  const { W, H, L, R, CW, txt, rect, line, rightAlign } = makePage();
  let y = H - 28;

  // Company info — top right
  const companyX = R - 180;
  txt("Alliaverre Glass Tech", companyX, y, { font: bold, size: 8, color: DARK });
  txt("14 allée du Nautilus — 80440 Glisy, France", companyX, y - 11, { size: 7.5, color: GRAY });
  txt("info@alliaverre.com", companyX, y - 21, { size: 7.5, color: GRAY });

  // LAWYER_REVIZORRO logo — top left
  txt("LAWYER_REVIZORRO", L, y, { font: bold, size: 24, color: NAVY });
  txt("VACUUM INSULATING GLAZING — TEMPERED", L, y - 16, { size: 6, color: GRAY });

  y -= 38;
  line(L, y, R, y, { thickness: 0.8, color: NAVY });
  y -= 2;

  // ── QUOTATION banner ──────────────────────────────────────────────
  const bannerH = 30;
  rect(L, y - bannerH, CW, bannerH, { color: NAVY });
  txt("QUOTATION", L + 14, y - 19, { font: bold, size: 15, color: WHITE });
  txt("lawyer-revizorro · Vacuum Insulating Glazing — Tempered", L + 14, y - 27, {
    size: 7,
    color: TABLE_HEADER_TEXT,
  });
  y -= bannerH + 14;

  // ── Customer + Quote Reference ────────────────────────────────────
  const midX = L + CW / 2 + 15;
  const sectionY = y;

  // Left column — Customer
  txt("CUSTOMER", L, y, { font: bold, size: 7.5, color: NAVY });
  y -= 14;
  txt(customer.name || "—", L, y, { font: bold, size: 10 });
  y -= 13;
  if (customer.city) { txt(customer.city, L, y, { size: 8.5 }); y -= 11; }
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
  txt("Payment: 50% deposit, balance before shipment — Bank transfer", midX, ry, {
    size: 7.5,
    color: GRAY,
    maxWidth: R - midX - 5,
  });
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
    const { productName, composition, groupLines, groupTotal, totalQty } = group;

    // Product header bar
    rect(L, y - 22, CW, 22, { color: NAVY });
    txt(productName, L + 10, y - 14, { font: bold, size: 9, color: WHITE });
    if (composition) {
      txt(composition, L + 10, y - 22 + 5, { size: 7, color: TABLE_HEADER_TEXT });
    }
    rightAlign(`${totalQty} units`, R - 6, y - 14, { font: bold, size: 9, color: WHITE });
    y -= 22 + 1;

    // Table header
    rect(L, y - 14, CW, 14, { color: rgb(0.18, 0.24, 0.42) });
    const COL = tableColumns(L, R);
    txt("N°", COL.num + 2, y - 10, { font: bold, size: 7, color: TABLE_HEADER_TEXT });
    txt("PRODUCT", COL.product + 2, y - 10, { font: bold, size: 7, color: TABLE_HEADER_TEXT });
    txt("L × H (MM)", COL.dims + 2, y - 10, { font: bold, size: 7, color: TABLE_HEADER_TEXT });
    txt("AREA (M²)", COL.area + 2, y - 10, { font: bold, size: 7, color: TABLE_HEADER_TEXT });
    txt("QTY", COL.qty + 2, y - 10, { font: bold, size: 7, color: TABLE_HEADER_TEXT });
    txt("UNIT PRICE", COL.unitPrice + 2, y - 10, { font: bold, size: 7, color: TABLE_HEADER_TEXT });
    txt("TOTAL", COL.total + 2, y - 10, { font: bold, size: 7, color: TABLE_HEADER_TEXT });
    y -= 14;

    // Table rows
    let rowNum = 1;
    for (const ql of groupLines) {
      const rowH = 14;
      const isEven = rowNum % 2 === 0;
      if (isEven) rect(L, y - rowH, CW, rowH, { color: LIGHT_GRAY });

      const areaPerUnit = (ql.lengthMm / 1000) * (ql.heightMm / 1000);
      const unitPriceEur = areaPerUnit * ql.unitPricePerM2;
      const dims = `${ql.lengthMm} × ${ql.heightMm}`;

      // Expand rows when qty > 1 to match image style
      if (ql.quantity > 1) {
        for (let i = 0; i < ql.quantity; i++) {
          const ri = rowH;
          if ((rowNum + i) % 2 === 0) rect(L, y - ri, CW, ri, { color: LIGHT_GRAY });
          txt(String(rowNum + i), COL.num + 4, y - 10, { size: 8 });
          txt(ql.productName || productName, COL.product + 2, y - 10, { size: 8 });
          txt(dims, COL.dims + 2, y - 10, { size: 8 });
          txt(fmtNum(areaPerUnit), COL.area + 2, y - 10, { size: 8 });
          txt("1", COL.qty + 2, y - 10, { size: 8 });
          rightAlign(fmtEur(unitPriceEur), COL.total - 2, y - 10, { size: 8 });
          rightAlign(fmtEur(unitPriceEur), R - 4, y - 10, { size: 8 });
          y -= ri;
          if (y < 120) {
            // TODO: add page break if needed
          }
        }
        rowNum += ql.quantity;
      } else {
        txt(String(rowNum), COL.num + 4, y - 10, { size: 8 });
        txt(ql.productName || productName, COL.product + 2, y - 10, { size: 8 });
        txt(dims, COL.dims + 2, y - 10, { size: 8 });
        txt(fmtNum(ql.surfaceM2 ?? areaPerUnit), COL.area + 2, y - 10, { size: 8 });
        txt(String(ql.quantity), COL.qty + 2, y - 10, { size: 8 });
        rightAlign(fmtEur(unitPriceEur), COL.total - 2, y - 10, { size: 8 });
        rightAlign(fmtEur(ql.lineTotal), R - 4, y - 10, { size: 8 });
        y -= rowH;
        rowNum++;
      }
    }
    y -= 8;
  }

  // ── Totals ────────────────────────────────────────────────────────
  const totalsX = R - 220;
  const totalsW = 220;
  line(L, y, R, y, { thickness: 0.5 });
  y -= 4;

  // Footnote annotations left
  const footNoteLines = buildFootnotes(lines, groups);
  let fnY = y;
  for (const fn of footNoteLines) {
    txt(fn, L, fnY, { size: 7, color: GRAY });
    fnY -= 10;
  }

  // Subtotal row
  txt("Subtotal excl. VAT", totalsX, y, { size: 8.5, color: GRAY });
  rightAlign(fmtEur(subtotal), R - 4, y, { font: bold, size: 8.5 });
  y -= 13;

  // Shipping row
  const shippingLabel =
    customer.country && customer.country !== "France"
      ? `Transport to ${customer.country}`
      : "Transport / Livraison";
  txt(shippingLabel, totalsX, y, { size: 8.5, color: GRAY });
  rightAlign(fmtEur(shipping), R - 4, y, { size: 8.5 });
  y -= 6;

  line(totalsX, y, R, y, { thickness: 0.5, color: NAVY });
  y -= 4;

  // TOTAL row
  rect(totalsX, y - 18, totalsW, 18, { color: NAVY });
  txt("TOTAL excl. VAT", totalsX + 8, y - 12, { font: bold, size: 9, color: WHITE });
  rightAlign(fmtEur(total), R - 6, y - 12, { font: bold, size: 11, color: WHITE });
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
  txt("⚠ IMPORTANT:", L + 8, y - 12, { font: bold, size: 8, color: AMBER });
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
  txt(aaText, L + CW / 2 - aaW / 2, y - 18, { font: bold, size: 12, color: WHITE });
  const subAaText = "Read and approved — Order confirmed";
  const subAaW = oblique.widthOfTextAtSize(subAaText, 8.5);
  txt(subAaText, L + CW / 2 - subAaW / 2, y - 31, { font: oblique, size: 8.5, color: TABLE_HEADER_TEXT });
  txt("Signature and stamp", L + CW / 2 - oblique.widthOfTextAtSize("Signature and stamp", 7.5) / 2, y - 41, {
    font: oblique,
    size: 7.5,
    color: NAVY_LIGHT,
  });
  y -= 56;

  // ── Terms & Conditions Extract ────────────────────────────────────
  txt("General Terms & Conditions (Extract)", L, y, { font: bold, size: 8.5 });
  y -= 12;
  const terms = [
    "1. PRODUCT — Vacuum insulating glazing tempered lawyer-revizorro by LandVac. Ug = 0.4 W/m²·K. CSTB n° ESE 24 34149 · SIREN 851 792 169.",
    "2. DIMENSIONS — Buyer is solely responsible for verifying all measurements before order confirmation.",
    "3. DELIVERY & TRANSPORT — Goods travel at the risk of the buyer. Any transport claim must be filed with the carrier within 48h of receipt.",
    "4. PAYMENT — 50% deposit at order, 50% balance before shipment. Late payment incurs a 10% penalty on unpaid amounts plus suspension of production and deliveries.",
  ];
  for (const t of terms) {
    txt(t, L, y, { size: 7, color: GRAY, maxWidth: CW });
    y -= 14;
  }
  y -= 4;

  // ── Bottom footer bar ─────────────────────────────────────────────
  rect(L, y - 20, CW, 20, { color: NAVY });
  const footerText = "ALLIAVERRE GLASS TECH  ·  Exclusive LandVac Distributor — France, Italy, Switzerland";
  const ftW = regular.widthOfTextAtSize(footerText, 7.5);
  txt(footerText, L + CW / 2 - ftW / 2, y - 13, { size: 7.5, color: TABLE_HEADER_TEXT });
  txt(
    "lawyer-revizorro by LandVac  ·  Ug = 0.4 W/m²·K  ·  CSTB n° ESE 24 34149  ·  SIREN 851 792 169",
    L + CW / 2 - regular.widthOfTextAtSize("lawyer-revizorro by LandVac  ·  Ug = 0.4 W/m²·K  ·  CSTB n° ESE 24 34149  ·  SIREN 851 792 169", 6.5) / 2,
    y - 21 + 4,
    { size: 6.5, color: NAVY_LIGHT }
  );

  // Save to disk
  const outDir = storageDir();
  await fs.mkdir(outDir, { recursive: true });

  const storageFilename = `quote-${reference}-${uuidv4().slice(0, 8)}.pdf`;
  const filePath = path.join(outDir, storageFilename);
  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(filePath, pdfBytes);

  const friendlyName = customer.name
    ? `Quotation_${customer.name.replace(/\s+/g, "_")}_${reference}.pdf`
    : `Quotation_${reference}.pdf`;

  return {
    filename: friendlyName,
    storageFilename,
    filePath,
    fileSize: pdfBytes.length,
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
      map.set(key, { productName: key, composition: null, groupLines: [], groupTotal: 0, totalQty: 0 });
    }
    const g = map.get(key);
    g.groupLines.push(l);
    g.groupTotal += l.lineTotal || 0;
    g.totalQty += l.quantity || 1;
  }
  return Array.from(map.values());
}

function buildFootnotes(lines, groups) {
  const fns = [];
  const totalArea = lines.reduce((s, l) => s + (l.surfaceM2 ?? 0), 0);
  const totalQty = lines.reduce((s, l) => s + (l.quantity || 1), 0);
  const productNames = [...new Set(lines.map((l) => l.productName || l.productId))].join(", ");
  fns.push(`Total area: ${fmtNum(totalArea)} m² · ${totalQty} glazing units · ${productNames}`);
  fns.push("Quote valid 30 days · Payment: 50% deposit, balance before shipment · Bank transfer");
  fns.push("Prices EXW — Delivery to customer country included in transport flat rate");
  return fns;
}

module.exports = { generateQuotePdf };
