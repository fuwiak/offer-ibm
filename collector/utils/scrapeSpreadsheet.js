/**
 * Нормализация листа Excel в TSV для заявок/спецификаций.
 *
 * Типичный BOM/спецификация: данные в правых колонках, слева пусто.
 * ChatGPT-style scrape: непустые ячейки строки → `артикул\tколичество`.
 */

const DESIGNATION_HEADER_RE =
  /обозначен|артикул|наименован|designation|article|sku|part\s*no|part\s*#/i;
const QTY_HEADER_RE = /кол-?во|количеств|qty|ilo[sś]ć|amount|pcs|шт\.?/i;

function cellText(cell) {
  if (cell === null || cell === undefined) return "";
  return String(cell).trim();
}

function nonemptyCells(row) {
  return (row || []).map(cellText).filter((v) => v !== "");
}

/**
 * Ищет строку заголовков с колонками обозначения и количества.
 * @param {Array<Array<*>>} data
 * @returns {{rowIndex: number, designationIdx: number, qtyIdx: number}|null}
 */
function findSpecHeader(data) {
  if (!Array.isArray(data)) return null;

  const limit = Math.min(data.length, 50);
  for (let i = 0; i < limit; i++) {
    const row = data[i] || [];
    let designationIdx = -1;
    let qtyIdx = -1;
    for (let c = 0; c < row.length; c++) {
      const t = cellText(row[c]);
      if (!t) continue;
      if (designationIdx < 0 && DESIGNATION_HEADER_RE.test(t)) designationIdx = c;
      if (qtyIdx < 0 && QTY_HEADER_RE.test(t)) qtyIdx = c;
    }
    if (designationIdx >= 0 && qtyIdx >= 0 && designationIdx !== qtyIdx) {
      return { rowIndex: i, designationIdx, qtyIdx };
    }
  }
  return null;
}

/**
 * Преобразует 2D-массив ячеек листа в TSV-текст.
 * При наличии заголовков «Обозначение/Артикул» + «Количество» пишет только эти колонки.
 * Иначе — все непустые ячейки строки (как в примере ChatGPT scrape).
 *
 * @param {Array<Array<*>>} data
 * @returns {string}
 */
function scrapeSheetData(data) {
  if (!Array.isArray(data) || data.length === 0) return "";

  const header = findSpecHeader(data);
  const lines = [];

  if (header) {
    for (let i = 0; i < header.rowIndex; i++) {
      const cells = nonemptyCells(data[i]);
      if (cells.length) lines.push(cells.join("\t"));
    }

    const headerRow = data[header.rowIndex] || [];
    lines.push(
      [
        cellText(headerRow[header.designationIdx]),
        cellText(headerRow[header.qtyIdx]),
      ]
        .filter(Boolean)
        .join("\t")
    );

    for (let i = header.rowIndex + 1; i < data.length; i++) {
      const row = data[i] || [];
      const designation = cellText(row[header.designationIdx]);
      const qty = cellText(row[header.qtyIdx]);
      if (!designation) continue;
      lines.push(qty ? `${designation}\t${qty}` : designation);
    }

    return lines.join("\n");
  }

  for (const row of data) {
    const cells = nonemptyCells(row);
    if (cells.length) lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

/**
 * Склеивает несколько листов в один текст с метками Sheet.
 * @param {Array<{name?: string, data?: Array<Array<*>>}>} sheets
 * @returns {string}
 */
function scrapeWorkbookSheets(sheets) {
  if (!Array.isArray(sheets) || sheets.length === 0) return "";

  const parts = [];
  for (const sheet of sheets) {
    const content = scrapeSheetData(sheet?.data || []);
    if (!content) continue;
    const name = String(sheet?.name || "Sheet1").trim() || "Sheet1";
    parts.push(`Sheet: ${name}\n${content}`);
  }
  return parts.join("\n\n");
}

module.exports = {
  DESIGNATION_HEADER_RE,
  QTY_HEADER_RE,
  cellText,
  nonemptyCells,
  findSpecHeader,
  scrapeSheetData,
  scrapeWorkbookSheets,
};
