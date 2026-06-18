const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

/**
 * Экспорт КП в XLSX для загрузки в 1С: Артикул, Количество, Цена с НДС.
 *
 * @param {object} quoteData
 * @param {Array} quoteData.lines — строки черновика
 * @returns {Promise<{filename: string, storageFilename: string, filePath: string, fileSize: number}>}
 */
async function generateQuoteXlsx(quoteData) {
  const { reference = "DRAFT", lines = [] } = quoteData;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OfferKP";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("КП для 1С", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Артикул", key: "article", width: 18 },
    { header: "Количество", key: "quantity", width: 14 },
    { header: "Цена с НДС", key: "priceWithVat", width: 16 },
    { header: "Наименование", key: "name", width: 40 },
    { header: "Статус", key: "status", width: 18 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F62FE" },
  };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const line of lines) {
    sheet.addRow({
      article: line.article || line.sku || "",
      quantity: line.quantity || 1,
      priceWithVat: line.priceWithVat ?? line.unitPrice ?? 0,
      name: line.name || line.productName || "",
      status: line.status || "",
    });
  }

  sheet.getColumn("quantity").numFmt = "#,##0";
  sheet.getColumn("priceWithVat").numFmt = "#,##0.00";

  const safeRef = String(reference).replace(/[^\w-]+/g, "_");
  const filename = `KP-${safeRef}.xlsx`;
  const storageDir = path.join(
    process.env.STORAGE_DIR || path.resolve(__dirname, "../../storage"),
    "generated-files"
  );
  fs.mkdirSync(storageDir, { recursive: true });
  const storageFilename = `${Date.now()}-${filename}`;
  const filePath = path.join(storageDir, storageFilename);

  await workbook.xlsx.writeFile(filePath);
  const fileSize = fs.statSync(filePath).size;

  return { filename, storageFilename, filePath, fileSize };
}

module.exports = { generateQuoteXlsx };
