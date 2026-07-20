/* eslint-env jest, node */

/**
 * Строгий e2e-тест разбора заявки
 * test_files/Slozhnost_vysokaya_1/Slozhnost_vysokaya_1.pdf.
 *
 * Вход: реальный текст таблицы после ingest PDF
 *   (__tests__/fixtures/offerKp/slozhnost-vysokaya-1-table.txt).
 * Эталон: test_files/Slozhnost_vysokaya_1/Slozhnost_vysokaya_1.expected.csv —
 *   20 позиций, наименование/ед. изм./кол-во должны совпадать 1-в-1.
 */

const fs = require("fs");
const path = require("path");

const { parseInquiryText } = require("../../../utils/offerKp/parseInquiry");
const { foldHomoglyphs } = require("../../../utils/offerKp/textNormalize");

const FIXTURE_TEXT = path.join(
  __dirname,
  "../../fixtures/offerKp/slozhnost-vysokaya-1-table.txt"
);
const EXPECTED_CSV = path.join(
  __dirname,
  "../../../../test_files/Slozhnost_vysokaya_1/Slozhnost_vysokaya_1.expected.csv"
);

/** Минимальный CSV-парсер: поля в кавычках могут содержать запятые. */
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

function loadExpectedRows() {
  const raw = fs.readFileSync(EXPECTED_CSV, "utf8").trim().split("\n");
  return raw.slice(1).map((line) => {
    const [nr, sourceName, unit, quantity] = parseCsvLine(line);
    return {
      nr: parseInt(nr, 10),
      sourceName,
      unit,
      quantity: parseInt(quantity, 10),
    };
  });
}

/**
 * Каноническая форма наименования: единый регистр + фолдинг
 * кириллица/латиница (М10х100 ≡ M10x100) + схлопывание пробелов.
 * Это нормализация самого пайплайна (textNormalize), не упрощение сравнения:
 * строки сравниваются целиком.
 */
function canon(name) {
  return foldHomoglyphs(String(name || ""))
    .replace(/\s+/g, " ")
    .trim();
}

describe("Slozhnost_vysokaya_1.pdf — точное извлечение 20 позиций", () => {
  const text = fs.readFileSync(FIXTURE_TEXT, "utf8");
  const expected = loadExpectedRows();
  const lines = parseInquiryText(text);

  it("эталон содержит ровно 20 строк", () => {
    expect(expected).toHaveLength(20);
  });

  it("парсер извлекает ровно столько строк, сколько в заявке", () => {
    expect(lines).toHaveLength(expected.length);
  });

  it.each(expected.map((row, idx) => [row.nr, row, idx]))(
    "строка %i: наименование, ед. изм. и кол-во совпадают с заявкой",
    (_nr, row, idx) => {
      const line = lines[idx];
      expect(line).toBeDefined();
      // Наименование — полная строка из PDF, без хвоста «30 кг» и без номера.
      expect(canon(line.name)).toBe(canon(row.sourceName));
      expect(line.unit).toBe(row.unit);
      expect(line.quantity).toBe(row.quantity);
      // кг → строка требует проверки пересчёта единиц, сумма не считается молча.
      expect(line.needsReview).toBe(true);
    }
  );

  it("резьба распознана для каждой строки (Mx из наименования)", () => {
    const expectedThreads = expected.map((row) => {
      const m = canon(row.sourceName).match(/m(\d+)x(\d+)/);
      return { size: m[1], length: m[2] };
    });
    lines.forEach((line, idx) => {
      expect(line.thread).toBeTruthy();
      expect(String(line.thread.size)).toBe(expectedThreads[idx].size);
      expect(String(line.thread.length)).toBe(expectedThreads[idx].length);
    });
  });

  it("количества не перепутаны с ценами и не потеряны", () => {
    const quantities = lines.map((l) => l.quantity);
    expect(quantities).toEqual([
      30, 14, 50, 40, 40, 40, 10, 3, 50, 10, 5, 25, 10, 15, 30, 50, 25, 7, 5,
      25,
    ]);
  });
});
