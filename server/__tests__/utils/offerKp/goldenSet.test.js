/* eslint-env jest, node */

/**
 * Strict golden-set runner for inquiry extraction (see test_files/README.md).
 *
 * Every real example must have an oracle:
 * - directory with .expected.csv -> parser fixture in server/__tests__/fixtures;
 * - directory with _scraped.txt -> table columns are the extraction oracle;
 * - standalone .txt -> sibling .expected.csv.
 *
 * Missing inputs or expected outputs fail the suite. Golden cases are never
 * skipped, because an untested customer document is not a passing document.
 */

const fs = require("fs");
const path = require("path");

const { parseInquiryText } = require("../../../utils/offerKp/parseInquiry");
const { foldHomoglyphs } = require("../../../utils/offerKp/textNormalize");

const TEST_FILES_DIR = path.join(__dirname, "../../../../test_files");
const FIXTURES_DIR = path.join(__dirname, "../../fixtures/offerKp");

function canon(name) {
  return foldHomoglyphs(String(name || ""))
    .replace(/\s+/g, " ")
    .replace(/\bm\s+(?=\d)/g, "m")
    .trim();
}

function slugify(name) {
  return name.toLowerCase().replace(/_/g, "-");
}

/** Minimal CSV parser: quoted fields may contain commas. */
function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function loadExpectedRows(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
  return raw.slice(1).map((line) => {
    const [nr, sourceName, unit, quantity] = parseCsvLine(line);
    return {
      nr: parseInt(nr, 10),
      sourceName,
      unit,
      quantity: Number(String(quantity).replace(",", ".")),
    };
  });
}

function normalizeExpectedUnit(unit, sourceName = "", quantityHeader = "") {
  const raw = `${unit || ""} ${quantityHeader || ""}`.toLowerCase();
  const full = `${sourceName || ""} ${raw}`.toLowerCase();
  if (/(?:^|\s)м\.?\s*п\.?(?:\s|$)|\bmeter|\bметр/.test(full)) return "м";
  if (/(?:^|\s)(?:кг|kg)(?:\s|\.|$)/.test(raw)) return "кг";
  if (/(?:^|\s)(?:уп|упак|pack)(?:\s|\.|$)/.test(raw)) return "уп";
  if (/(?:^|\s)(?:л|литр)(?:\s|\.|$)/.test(raw)) return "л";
  if (/(?:^|\s)(?:т|тонн)(?:\s|\.|$)/.test(raw)) return "т";
  return "шт";
}

function loadExpectedRowsFromScrapedTable(tablePath) {
  const rows = fs
    .readFileSync(tablePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("\t"));
  const headerIndex = rows.findIndex((line) => /колич|кол-?во|qty/i.test(line));
  if (headerIndex < 0) {
    throw new Error(`Golden table has no quantity header: ${tablePath}`);
  }

  const header = rows[headerIndex].split("\t").map((cell) => cell.trim());
  const nameIndex = header.findIndex((cell) =>
    /наимен|обознач|артикул|товар/i.test(cell)
  );
  const quantityIndex = header.findIndex((cell) =>
    /колич|кол-?во|qty/i.test(cell)
  );
  const unitIndex = header.findIndex((cell) =>
    /ед\.?\s*измер|unit/i.test(cell)
  );
  if (nameIndex < 0 || quantityIndex < 0) {
    throw new Error(`Golden table has unsupported columns: ${tablePath}`);
  }

  return rows
    .slice(headerIndex + 1)
    .map((line, index) => {
      const columns = line.split("\t").map((cell) => cell.trim());
      const sourceName = columns[nameIndex] || "";
      const quantity = Number(
        String(columns[quantityIndex] || "").replace(",", ".")
      );
      if (!sourceName || !Number.isFinite(quantity)) return null;
      return {
        nr: index + 1,
        sourceName,
        unit: normalizeExpectedUnit(
          unitIndex >= 0 ? columns[unitIndex] : "",
          sourceName,
          header[quantityIndex]
        ),
        quantity,
      };
    })
    .filter(Boolean);
}

function extractSpreadsheetText(inputPath) {
  const nodeXlsxPath = path.join(
    __dirname,
    "../../../../collector/node_modules/node-xlsx"
  );
  const scraperPath = path.join(
    __dirname,
    "../../../../collector/utils/scrapeSpreadsheet"
  );
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const xlsx = require(nodeXlsxPath).default;
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const { scrapeSheetData } = require(scraperPath);
  return xlsx
    .parse(inputPath)
    .map((sheet) => scrapeSheetData(sheet.data || []))
    .filter(Boolean)
    .join("\n\n");
}

function discoverDirectoryExamples(entries) {
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const name = entry.name;
      const dir = path.join(TEST_FILES_DIR, name);
      const files = fs.readdirSync(dir);
      const csvFile = files.find((file) => file.endsWith(".expected.csv"));
      const scrapedFile = files.find((file) => /_scraped\.txt$/i.test(file));
      const sourceFile = files.find((file) =>
        /\.(?:pdf|xlsx|xls|docx|png|jpe?g)$/i.test(file)
      );
      const fixturePath = path.join(FIXTURES_DIR, `${slugify(name)}-table.txt`);

      if (csvFile) {
        const missing = [];
        if (!sourceFile) missing.push("source document");
        if (!fs.existsSync(fixturePath)) missing.push("parser fixture");
        return {
          name,
          csvPath: path.join(dir, csvFile),
          inputPath: fixturePath,
          sourceDocumentPath: sourceFile ? path.join(dir, sourceFile) : null,
          configurationError: missing.length
            ? `missing ${missing.join(" and ")}`
            : null,
        };
      }
      if (scrapedFile) {
        const inputPath = path.join(dir, scrapedFile);
        return {
          name,
          inputPath,
          scrapedTablePath: inputPath,
          sourceDocumentPath: sourceFile ? path.join(dir, sourceFile) : null,
          configurationError: sourceFile ? null : "missing source document",
        };
      }
      return {
        name,
        configurationError: "missing .expected.csv or _scraped.txt output",
      };
    });
}

function discoverStandaloneExamples(entries) {
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".txt") &&
        entry.name !== "README.md"
    )
    .map((entry) => {
      const name = entry.name.replace(/\.txt$/i, "");
      const inputPath = path.join(TEST_FILES_DIR, entry.name);
      const csvPath = path.join(TEST_FILES_DIR, `${name}.expected.csv`);
      return {
        name,
        inputPath,
        sourceDocumentPath: inputPath,
        csvPath,
        configurationError: fs.existsSync(csvPath)
          ? null
          : `missing expected output: ${path.relative(process.cwd(), csvPath)}`,
      };
    });
}

function discoverGoldenExamples() {
  if (!fs.existsSync(TEST_FILES_DIR)) return [];
  const entries = fs.readdirSync(TEST_FILES_DIR, { withFileTypes: true });
  return [
    ...discoverDirectoryExamples(entries),
    ...discoverStandaloneExamples(entries),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

const examples = discoverGoldenExamples();
const report = [];

describe("Golden set — strict inquiry extraction", () => {
  if (!examples.length) {
    it("contains at least one golden example", () => {
      expect(examples.length).toBeGreaterThan(0);
    });
    return;
  }

  examples.forEach(
    ({
      name,
      csvPath,
      inputPath,
      scrapedTablePath,
      sourceDocumentPath,
      configurationError,
    }) => {
      describe(name, () => {
        if (configurationError) {
          it("has a complete golden input/output pair", () => {
            throw new Error(`${name}: ${configurationError}`);
          });
          return;
        }

        const savedText = fs.readFileSync(inputPath, "utf8");
        const isSpreadsheet = /\.xlsx?$/i.test(sourceDocumentPath || "");
        const text = isSpreadsheet
          ? extractSpreadsheetText(sourceDocumentPath)
          : savedText;
        const expected = csvPath
          ? loadExpectedRows(csvPath)
          : loadExpectedRowsFromScrapedTable(scrapedTablePath);
        const lines = parseInquiryText(text);

        let extractedOk = 0;
        let qtyUnitOk = 0;

        it("has the original source document", () => {
          if (!sourceDocumentPath) return;
          expect(fs.statSync(sourceDocumentPath).size).toBeGreaterThan(0);
        });

        if (isSpreadsheet) {
          it("extracts the XLSX input exactly as the saved golden text", () => {
            expect(text.trim()).toBe(savedText.trim());
          });
        }

        it("extracts exactly the expected number of rows", () => {
          expect(lines).toHaveLength(expected.length);
        });

        it.each(expected.map((row, index) => [row.nr, row, index]))(
          "row %i matches name, unit and quantity exactly",
          (_nr, row, index) => {
            const line = lines[index];
            expect(line).toBeDefined();
            if (!line) return;

            const nameMatch = canon(line.name) === canon(row.sourceName);
            const unitMatch = line.unit === row.unit;
            const quantityMatch = line.quantity === row.quantity;
            if (unitMatch && quantityMatch) qtyUnitOk++;
            if (nameMatch && unitMatch && quantityMatch) extractedOk++;

            expect(canon(line.name)).toBe(canon(row.sourceName));
            expect(line.unit).toBe(row.unit);
            expect(line.quantity).toBe(row.quantity);
          }
        );

        afterAll(() => {
          report.push({
            name,
            total: expected.length,
            extractedOk,
            qtyUnitOk,
          });
        });
      });
    }
  );

  afterAll(() => {
    if (!report.length) return;
    const totals = report.reduce(
      (acc, row) => ({
        total: acc.total + row.total,
        extractedOk: acc.extractedOk + row.extractedOk,
        qtyUnitOk: acc.qtyUnitOk + row.qtyUnitOk,
      }),
      { total: 0, extractedOk: 0, qtyUnitOk: 0 }
    );
    const pct = (value, total) =>
      total ? ((value / total) * 100).toFixed(1) : "n/a";

    const output = [
      "",
      "=== Golden set — strict extraction summary ===",
      ...report.map(
        (row) =>
          `  ${row.name}: ${row.extractedOk}/${row.total} exact (${pct(
            row.extractedOk,
            row.total
          )}%), quantity/unit ${pct(row.qtyUnitOk, row.total)}%`
      ),
      `  TOTAL (${report.length} files, ${totals.total} rows): ` +
        `exact ${pct(totals.extractedOk, totals.total)}%, ` +
        `quantity/unit ${pct(totals.qtyUnitOk, totals.total)}%`,
      "================================================",
      "",
    ];
    // eslint-disable-next-line no-console
    console.log(output.join("\n"));
  });
});
