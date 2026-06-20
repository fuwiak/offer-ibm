/** Parse numeric cell (strip currency, spaces). */
export function parseQuoteCellNumber(value) {
  if (value == null || value === "") return 0;
  const cleaned = String(value)
    .replace(/\s/g, "")
    .replace(/[^\d.,-]/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function columnIndex(headers, keywords) {
  for (const kw of keywords) {
    const i = headers.findIndex((h) => h.includes(kw));
    if (i >= 0) return i;
  }
  return -1;
}

function recalcParsedLine(line) {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.priceWithVat) || 0;
  const lineTotal =
    line.lineTotal > 0 ? line.lineTotal : Number((qty * price).toFixed(2));
  return { ...line, lineTotal, quantity: qty || 1, priceWithVat: price };
}

/**
 * Extract quote line items from generated KP markdown (auto-quote or agent DOCX source).
 */
export function parseQuoteMarkdown(markdown = "") {
  const text = String(markdown || "").trim();
  if (!text) return [];

  const tableRows = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") && l.endsWith("|"));

  if (tableRows.length < 2) return [];

  const headers = tableRows[0]
    .split("|")
    .slice(1, -1)
    .map((h) => h.trim().toLowerCase());

  const dataRows = tableRows.slice(1).filter((row) => {
    const inner = row
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    return inner.some((c) => c && !/^[-:]+$/.test(c));
  });

  const idxName = columnIndex(headers, [
    "наимен",
    "name",
    "product",
    "описан",
    "товар",
  ]);
  const idxArticle = columnIndex(headers, ["артикул", "article", "sku", "код"]);
  const idxQty = columnIndex(headers, ["кол", "qty", "quantity", "кол-во"]);
  const idxUnit = columnIndex(headers, ["ед", "unit"]);
  const idxPrice = columnIndex(headers, ["цена", "price"]);
  const idxSum = columnIndex(headers, ["сумм", "total", "итого"]);
  const idxWeight = columnIndex(headers, ["вес", "weight"]);
  const idxStatus = columnIndex(headers, ["статус", "status"]);
  const idxComment = columnIndex(headers, [
    "коммент",
    "comment",
    "note",
    "примеч",
  ]);

  const lines = [];
  for (const row of dataRows) {
    const cols = row
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (!cols.length) continue;

    const nameCol = idxName >= 0 ? idxName : cols.length > 1 ? 1 : 0;
    const name = cols[nameCol] || "";
    if (!name || /^[-—–]+$/.test(name)) continue;

    const qty = idxQty >= 0 ? parseQuoteCellNumber(cols[idxQty]) : 1;
    const priceWithVat =
      idxPrice >= 0 ? parseQuoteCellNumber(cols[idxPrice]) : 0;
    const lineTotal = idxSum >= 0 ? parseQuoteCellNumber(cols[idxSum]) : 0;

    lines.push(
      recalcParsedLine({
        name,
        article: idxArticle >= 0 ? cols[idxArticle] : "",
        quantity: qty || 1,
        unit: idxUnit >= 0 ? cols[idxUnit] || "шт" : "шт",
        priceWithVat,
        lineTotal,
        weightKg: idxWeight >= 0 ? parseQuoteCellNumber(cols[idxWeight]) : 0,
        status: idxStatus >= 0 ? cols[idxStatus] : "Требует проверки",
        comment: idxComment >= 0 ? cols[idxComment] : "",
        alternatives: [],
      })
    );
  }

  return lines;
}

/** Extract KP reference from markdown heading. */
export function parseQuoteReferenceFromMarkdown(markdown = "") {
  const text = String(markdown || "");
  const m = text.match(
    /(?:коммерческ(?:ое)?\s+предложение|commercial\s+offer|quote)\s*(?:№|#)?\s*([A-Za-z0-9_-]+)/i
  );
  return m?.[1] || null;
}
