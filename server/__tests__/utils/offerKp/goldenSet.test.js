/* eslint-env jest, node */

/**
 * Golden-set раннер для экстракции заявок (см. test_files/README.md).
 *
 * Подхватывает КАЖДУЮ папку-пример:
 *   test_files/<Name>/<Name>.expected.csv
 *   test_files/<Name>/<Name>.pdf (или другой исходник — тестом не читается)
 *   server/__tests__/fixtures/offerKp/<slug>-table.txt   (slug = <Name> в
 *     нижнем регистре, "_" -> "-")
 * без изменений в этом файле — просто положи новую папку и запусти
 * `yarn test:golden`.
 *
 * Если для эталона ещё нет фикстуры с текстом таблицы (её вручную
 * заполняют из ingest/OCR, см. README), пример помечается как skipped —
 * это ожидаемо на этапе "эталон уже добавлен, текст ещё нет".
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
    .trim();
}

function slugify(name) {
  return name.toLowerCase().replace(/_/g, "-");
}

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

function loadExpectedRows(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf8").trim().split("\n");
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

function discoverGoldenExamples() {
  if (!fs.existsSync(TEST_FILES_DIR)) return [];
  return fs
    .readdirSync(TEST_FILES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const name = entry.name;
      const dir = path.join(TEST_FILES_DIR, name);
      const csvFile = fs
        .readdirSync(dir)
        .find((f) => f.endsWith(".expected.csv"));
      if (!csvFile) return null;
      const csvPath = path.join(dir, csvFile);
      const fixturePath = path.join(
        FIXTURES_DIR,
        `${slugify(name)}-table.txt`
      );
      return { name, csvPath, fixturePath };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const examples = discoverGoldenExamples();
const report = [];

describe("Golden set — экстракция заявок", () => {
  if (!examples.length) {
    it("нет эталонных примеров в test_files/ (см. test_files/README.md)", () => {
      expect(examples.length).toBeGreaterThan(0);
    });
    return;
  }

  examples.forEach(({ name, csvPath, fixturePath }) => {
    describe(name, () => {
      if (!fs.existsSync(fixturePath)) {
        it.skip(`пропущено: нет фикстуры ${path.relative(process.cwd(), fixturePath)} (см. test_files/README.md)`, () => {});
        return;
      }

      const text = fs.readFileSync(fixturePath, "utf8");
      const expected = loadExpectedRows(csvPath);
      const lines = parseInquiryText(text);

      let extractedOk = 0;
      let qtyUnitOk = 0;

      it("извлекает ровно столько строк, сколько в эталоне", () => {
        expect(lines).toHaveLength(expected.length);
      });

      it.each(expected.map((row, idx) => [row.nr, row, idx]))(
        "строка %i: наименование, ед. изм. и кол-во совпадают с эталоном",
        (_nr, row, idx) => {
          const line = lines[idx];
          expect(line).toBeDefined();
          if (!line) return;

          const nameMatch = canon(line.name) === canon(row.sourceName);
          const unitMatch = line.unit === row.unit;
          const qtyMatch = line.quantity === row.quantity;

          if (unitMatch && qtyMatch) qtyUnitOk++;
          if (nameMatch && unitMatch && qtyMatch) extractedOk++;

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
  });

  afterAll(() => {
    if (!report.length) return;
    const totals = report.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        extractedOk: acc.extractedOk + r.extractedOk,
        qtyUnitOk: acc.qtyUnitOk + r.qtyUnitOk,
      }),
      { total: 0, extractedOk: 0, qtyUnitOk: 0 }
    );
    const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : "n/a");

    const lines = [
      "",
      "=== Golden set — сводка по экстракции ===",
      ...report.map(
        (r) =>
          `  ${r.name}: ${r.extractedOk}/${r.total} позиций верно (${pct(
            r.extractedOk,
            r.total
          )}%), кол-во/ед.изм. верно ${pct(r.qtyUnitOk, r.total)}%`
      ),
      `  ИТОГО (${report.length} файл(ов), ${totals.total} позиций): ` +
        `позиции верно ${pct(totals.extractedOk, totals.total)}%, ` +
        `кол-во/ед.изм. верно ${pct(totals.qtyUnitOk, totals.total)}%`,
      "===========================================",
      "",
    ];
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
  });
});
