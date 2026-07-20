const fs = require("fs");
const path = require("path");
const {
  normalizeOcrInquiryText,
  splitInquiryChunks,
  parseInquiryText,
} = require("../../../utils/offerKp/parseInquiry");

const SLOZHNOST_FIXTURE = path.join(
  __dirname,
  "../../fixtures/offerKp/slozhnost-vysokaya-1-table.txt"
);

const SLOZHNOST_EXPECTED_ROWS = [
  { thread: "10x100", gost: "7805", qty: 30, unit: "кг" },
  { thread: "10x20", gost: "7805", qty: 14, unit: "кг" },
  { thread: "10x35", gost: "7805", qty: 50, unit: "кг" },
  { thread: "10x45", gost: "7805", qty: 40, unit: "кг" },
  { thread: "10x50", gost: "7805", qty: 40, unit: "кг" },
  { thread: "10x70", gost: "7805", qty: 40, unit: "кг" },
  { thread: "10x80", gost: "7805", qty: 10, unit: "кг" },
  { thread: "6x25", gost: "7805", qty: 3, unit: "кг" },
  { thread: "6x30", gost: "7805", qty: 50, unit: "кг" },
  { thread: "6x35", gost: "7805", qty: 10, unit: "кг" },
  { thread: "6x40", gost: "7798", qty: 5, unit: "кг" },
  { thread: "6x45", gost: "7805", qty: 25, unit: "кг" },
  { thread: "8x16", gost: "7805", qty: 10, unit: "кг" },
  { thread: "8x20", gost: "7805", qty: 15, unit: "кг", coating: "оцинк" },
  { thread: "8x25", gost: "7805", qty: 30, unit: "кг" },
  { thread: "8x30", gost: "7805", qty: 50, unit: "кг" },
  { thread: "8x45", gost: "7805", qty: 25, unit: "кг" },
  { thread: "8x50", gost: "7805", qty: 7, unit: "кг" },
  { thread: "8x60", gost: "7805", qty: 5, unit: "кг" },
  { thread: "8x70", gost: "7798", qty: 25, unit: "кг" },
];

describe("parseInquiry PDF/OCR extraction", () => {
  it("normalizes spaced DIN and thread markers", () => {
    const raw = "D I N 975  M 36 x 2000  4.8 оцинк";
    expect(normalizeOcrInquiryText(raw)).toContain("DIN 975");
    expect(normalizeOcrInquiryText(raw)).toMatch(/M36x2000/i);
  });

  it("splits tabular PDF rows into product lines", () => {
    const table = [
      "Наименование\tКол-во\tАртикул",
      "Штанга DIN 975 M36x2000 4.8 оцинк\t10\t12345678",
      "Болт DIN 933 M10x50 8.8\t25\t87654321",
    ].join("\n");

    const chunks = splitInquiryChunks(table);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => /DIN 975.*M36/i.test(c))).toBe(true);
    expect(chunks.some((c) => /DIN 933.*M10/i.test(c))).toBe(true);
  });

  it("parses inquiry lines with quantities from OCR table text", () => {
    const text = [
      "1. Штанга DIN 975 M36x2000 4.8 оцинк - 10 шт",
      "2. Болт DIN 933 M10x50 8.8 - 25 шт",
    ].join("\n");

    const lines = parseInquiryText(text);
    expect(lines.length).toBe(2);
    expect(lines[0].quantity).toBe(10);
    expect(lines[0].dinNumbers).toContain("975");
    expect(lines[1].quantity).toBe(25);
  });

  it("preserves decimal quantities for weight units", () => {
    const lines = parseInquiryText(
      "Болт DIN 933 M10x50 8.8 - 7,40 кг\nГайка DIN 934 M10 - 0,5 кг"
    );

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ quantity: 7.4, unit: "кг" });
    expect(lines[1]).toMatchObject({ quantity: 0.5, unit: "кг" });
  });

  it("preserves decimal kg quantities from table columns", () => {
    const lines = parseInquiryText(
      "Наименование | Ед. изм. | Количество\nБолт DIN 933 M10x50 | кг | 7.40"
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ quantity: 7.4, unit: "кг" });
  });

  it("parses Slozhnost_vysokaya_1 bolt table (20 rows, kg units, GOST)", () => {
    const text = fs.readFileSync(SLOZHNOST_FIXTURE, "utf8");

    expect(text).toContain("Приложение №1");
    expect(text).toContain("Перечень болтов с гайками");
    expect(text).toMatch(/Болт M10x100.*ГОСТ 7805-70/);
    expect(text).toMatch(/Болт M8x70.*ГОСТ 7798-70/);

    const chunks = splitInquiryChunks(text);
    expect(chunks).toHaveLength(20);
    expect(chunks.every((c) => /^Болт M\d+x\d+/i.test(c))).toBe(true);
    expect(chunks.some((c) => /Перечень болтов/i.test(c))).toBe(false);
    expect(chunks.some((c) => /Наименование товара/i.test(c))).toBe(false);

    const lines = parseInquiryText(text);
    expect(lines).toHaveLength(20);

    lines.forEach((line, idx) => {
      const expected = SLOZHNOST_EXPECTED_ROWS[idx];
      expect(line.productTypes).toContain("болт");
      expect(line.thread).toEqual({
        size: expected.thread.split("x")[0],
        length: expected.thread.split("x")[1],
      });
      expect(line.dinNumbers).toContain(expected.gost);
      expect(line.quantity).toBe(expected.qty);
      expect(line.unit).toBe(expected.unit);
      expect(line.needsReview).toBe(true);
      if (expected.coating) {
        expect(line.coating).toBe(expected.coating);
      }
      expect(line.name).toMatch(new RegExp(`M${expected.thread}`, "i"));
      expect(line.name).toMatch(new RegExp(`ГОСТ ${expected.gost}`, "i"));
    });
  });

  it("parses Excel-scraped designation\\tqty TSV without header noise", () => {
    const text = [
      "Спецификация 77",
      "Обозначение (Артикул)\tКоличество шт",
      "Болт М12-6gx40.88.019 ГОСТ 7805-70\t4",
      "Винт DIN 7500-Е М5х12-St\t75",
      "Гайка М6-6Н.5.019 ГОСТ 5927-70\t6",
    ].join("\n");

    const chunks = splitInquiryChunks(text);
    expect(chunks.some((c) => /Спецификац/i.test(c))).toBe(false);
    expect(chunks.some((c) => /Обозначение/i.test(c))).toBe(false);
    expect(chunks.length).toBeGreaterThanOrEqual(3);

    const lines = parseInquiryText(text);
    expect(lines.some((l) => l.quantity === 4 && /ГОСТ 7805/i.test(l.name))).toBe(
      true
    );
    expect(lines.some((l) => l.quantity === 75 && /DIN 7500/i.test(l.name))).toBe(
      true
    );
    expect(lines.some((l) => l.quantity === 6 && /Гайка/i.test(l.name))).toBe(
      true
    );
  });
});
