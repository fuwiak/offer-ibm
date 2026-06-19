const TABULAR_EXTENSIONS = new Set([
  "csv",
  "tsv",
  "xlsx",
  "xls",
  "ods",
]);

function parseCsvLine(line, delimiter = ",") {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  result.push(current);
  return result.map((cell) => cell.trim());
}

function splitSheets(pageContent = "") {
  const text = String(pageContent || "").trim();
  if (!text) return [];

  const normalized = text.replace(/^Sheet:\s*/i, "\nSheet: ");
  if (!/\nSheet:\s*/i.test(normalized)) {
    return [{ name: "Data", content: text }];
  }

  const parts = normalized.split(/\nSheet:\s*/i).filter(Boolean);
  return parts.map((part) => {
    const newline = part.indexOf("\n");
    if (newline === -1) return { name: part.trim(), content: "" };
    return {
      name: part.slice(0, newline).trim() || "Sheet",
      content: part.slice(newline + 1).trim(),
    };
  });
}

function detectDelimiter(sampleLine = "") {
  const tabs = (sampleLine.match(/\t/g) || []).length;
  const commas = (sampleLine.match(/,/g) || []).length;
  const semicolons = (sampleLine.match(/;/g) || []).length;
  if (tabs >= commas && tabs >= semicolons && tabs > 0) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}

function sheetToTable(sheetContent = "") {
  const lines = String(sheetContent || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => parseCsvLine(line, delimiter));

  return {
    headers,
    rows,
    totalRows: rows.length,
  };
}

function extensionFromFilename(filename = "") {
  const base = String(filename).split("/").pop() || "";
  const withoutJson = base.replace(/\.json$/i, "");
  const match = withoutJson.match(/\.([a-z0-9]+)(?:-[0-9a-f-]{36})?$/i);
  return match ? match[1].toLowerCase() : "";
}

function isTabularFilename(filename = "") {
  return TABULAR_EXTENSIONS.has(extensionFromFilename(filename));
}

function countContentLines(pageContent = "") {
  const sheets = splitSheets(pageContent);
  return sheets.reduce((sum, sheet) => {
    const lines = String(sheet.content || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return sum + Math.max(0, lines.length - 1);
  }, 0);
}

function buildTabularPreview(pageContent = "", options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 25));
  const offset = Math.max(0, Number(options.offset) || 0);
  const sheetIndex = Math.max(0, Number(options.sheetIndex) || 0);

  const sheets = splitSheets(pageContent);
  if (!sheets.length) {
    return {
      isTabular: false,
      headers: [],
      rows: [],
      totalRows: 0,
      sheets: [],
      sheetIndex: 0,
      sheetName: null,
    };
  }

  const activeSheet = sheets[sheetIndex] || sheets[0];
  const table = sheetToTable(activeSheet.content);
  const slicedRows = table.rows.slice(offset, offset + limit);

  return {
    isTabular: table.headers.length > 0 || table.totalRows > 0,
    headers: table.headers,
    rows: slicedRows,
    totalRows: table.totalRows,
    offset,
    limit,
    sheets: sheets.map((sheet) => sheet.name),
    sheetIndex: Math.min(sheetIndex, sheets.length - 1),
    sheetName: activeSheet.name,
  };
}

module.exports = {
  TABULAR_EXTENSIONS,
  parseCsvLine,
  splitSheets,
  sheetToTable,
  extensionFromFilename,
  isTabularFilename,
  countContentLines,
  buildTabularPreview,
};
