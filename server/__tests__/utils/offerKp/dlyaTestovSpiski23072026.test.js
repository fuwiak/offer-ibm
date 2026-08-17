/* eslint-env jest, node */

/**
 * Golden-фикстура «Для тестов списки 23072026» (test_files/Dlya_testov_spiski_23072026):
 * шесть реальных заявок в одном DOCX — inline-списки, нумерованные строки,
 * буллеты с количеством отдельной строкой и вертикальная таблица
 * («№ / Наименование / ед-ца изм / кол-во» — каждая ячейка своей строкой).
 *
 * 1. Экстракция (всегда): parseInquiryText — количества/единицы, включая
 *    схлопывание вертикальной таблицы (mergeVerticalTableCells).
 * 2. Наличие в ShopDB (SHOP_DB_INTEGRATION=1): каждая позиция гоняется через
 *    searchProductsExtended; тест печатает список позиций без кандидатов и
 *    требует минимального покрытия каталогом (OFFER_KP_PRESENCE_MIN, 0..1).
 */

const fs = require("fs");
const path = require("path");

const FIXTURE = path.resolve(
  __dirname,
  "../../../../test_files/Dlya_testov_spiski_23072026/Dlya_testov_spiski_23072026.txt"
);

const runIntegration =
  process.env.SHOP_DB_INTEGRATION === "1" ||
  process.env.SHOP_DB_INTEGRATION === "true";
const describeIf = runIntegration ? describe : describe.skip;

function loadLines() {
  const {
    parseInquiryText,
  } = require("../../../utils/offerKp/parseInquiry");
  const text = fs.readFileSync(FIXTURE, "utf8");
  return parseInquiryText(text);
}

function findLine(lines, re) {
  return lines.find((l) => re.test(l.name));
}

describe("Dlya_testov_spiski_23072026 — extraction", () => {
  let lines;
  beforeAll(() => {
    lines = loadLines();
  });

  it("fixture exists and parses into full position list", () => {
    expect(fs.existsSync(FIXTURE)).toBe(true);
    expect(lines.length).toBeGreaterThanOrEqual(130);
  });

  it.each([
    [/^Гайка М24-6Н ГОСТ 8918-69/u, 1, "шт"],
    [/^Шайба 24 DIN 127/u, 1, "шт"],
    [/^Штифт 5x15 DIN 6325/u, 240, "шт"],
    [/^Рым-болт М10\.019 ГОСТ 4751-73/u, 120, "шт"],
    [/^Гайка M2-6H\.5 ГОСТ 5915-70/u, 601, "шт"],
  ])("inline/bullet line %s → qty %s %s", (re, qty, unit) => {
    const line = findLine(lines, re);
    expect(line).toBeTruthy();
    expect(line.quantity).toBe(qty);
    expect(line.unit).toBe(unit);
  });

  // Вертикальная таблица: до фикса qty бралось из номера ГОСТа («…11738-84»
  // → 84), номер строки «41» слипался с предыдущей позицией.
  it.each([
    [/^Болт М8x20 ГОСТ 7805-70/u, 50, "шт"],
    [/^Гайка М24 ГОСТ 2526-70/u, 10, "шт"],
    [/^Винт М16x35\.58\.019 ГОСТ 11738-84/u, 10, "шт"],
    [/^Шпонка 12x8x50 ГОСТ 23360-78/u, 2, "шт"],
    [/^Шайба 20 ГОСТ 6958-78/u, 10, "шт"],
    [/^Шпилька М16/u, 4, "м"],
  ])("vertical table line %s → qty %s %s", (re, qty, unit) => {
    const line = findLine(lines, re);
    expect(line).toBeTruthy();
    expect(line.quantity).toBe(qty);
    expect(line.unit).toBe(unit);
  });

  it("no row-index numbers leak into quantities of neighbouring lines", () => {
    const bolt7805 = lines.filter((l) => /ГОСТ 7805-70/u.test(l.name));
    expect(bolt7805.length).toBe(17);
    // Все количества из колонки «кол-во», ни одно не 7805/70 и не номер строки.
    for (const l of bolt7805) {
      expect(l.quantity).toBeGreaterThanOrEqual(10);
      expect(l.quantity).toBeLessThanOrEqual(100);
    }
  });
});

describeIf(
  "Dlya_testov_spiski_23072026 — ShopDB presence (SHOP_DB_INTEGRATION=1)",
  () => {
    beforeAll(() => {
      const { loadEnv } = require("../../../config/loadEnv");
      process.chdir(path.resolve(__dirname, "../../.."));
      loadEnv();
    });

    jest.setTimeout(10 * 60 * 1000);

    it("every position is searched; catalog coverage above threshold", async () => {
      const {
        searchProductsExtended,
      } = require("../../../utils/offerKp/shopDbSearch");
      const {
        parseHardwareQuery,
      } = require("../../../utils/offerKp/hardwareQuery");

      const lines = loadLines();
      const uniqueNames = [...new Set(lines.map((l) => l.name))];
      const found = [];
      const missing = [];

      for (const name of uniqueNames) {
        const parsed = parseHardwareQuery(name);
        const { products } = await searchProductsExtended([name], parsed, 5);
        if (products.length) {
          found.push(name);
        } else {
          missing.push(name);
        }
      }

      const coverage = found.length / uniqueNames.length;
      // Отчёт наличия — главный артефакт теста: что из заявки есть в каталоге.
      console.log(
        `[presence] ShopDB coverage ${(coverage * 100).toFixed(1)}% ` +
          `(${found.length}/${uniqueNames.length} позиций с кандидатами)`
      );
      if (missing.length) {
        console.log(
          `[presence] Без кандидатов в ShopDB (${missing.length}):\n` +
            missing.map((n) => `  - ${n}`).join("\n")
        );
      }

      expect(found.length).toBeGreaterThan(0);
      const minCoverage = Math.min(
        1,
        Math.max(0, Number(process.env.OFFER_KP_PRESENCE_MIN || 0.5))
      );
      expect(coverage).toBeGreaterThanOrEqual(minCoverage);
    });
  }
);
