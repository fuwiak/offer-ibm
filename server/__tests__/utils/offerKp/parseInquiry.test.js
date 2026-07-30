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

  it("keeps specifications written after an inline quantity", () => {
    const [line] = parseInquiryText(
      "Винт с цилиндрической головкой --10шт DIN 912 -М8х14-10,9 цинк"
    );

    expect(line).toMatchObject({ quantity: 10, unit: "шт" });
    expect(line.name).toMatch(/DIN 912.*[MМ]8x14.*цинк/i);
  });

  it("preserves decimal running meters from a generic quantity table", () => {
    const [line] = parseInquiryText(
      "Обозначение (Артикул)\tКоличество шт\n" +
        "Уплотнитель неопрен с клеевым слоем 8х2 м.п.\t7.4"
    );

    expect(line).toMatchObject({ quantity: 7.4, unit: "м" });
    expect(line.name).toMatch(/Уплотнитель.*м\.п\./i);
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
    expect(
      lines.some((l) => l.quantity === 4 && /ГОСТ 7805/i.test(l.name))
    ).toBe(true);
    expect(
      lines.some((l) => l.quantity === 75 && /DIN 7500/i.test(l.name))
    ).toBe(true);
    expect(lines.some((l) => l.quantity === 6 && /Гайка/i.test(l.name))).toBe(
      true
    );
  });

  it("explodes packed supply RFQ into separate product lines", () => {
    const text =
      "Здравствуйте, просьба направить предложение на поставку: Гайка М24-6Н ГОСТ 8918-69 1шт\n" +
      "Шайба 24 DIN 127 1шт Шпилька М24-6g DIN 975 1шт Штифт 14х32 DIN 6325 8шт Рым-болт DIN 580 - М12 2шт";
    const lines = parseInquiryText(text);
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(lines[0].raw).toMatch(/^Гайка/i);
    expect(lines.some((l) => /Шпилька/i.test(l.raw))).toBe(true);
    expect(lines.some((l) => /Рым-болт/i.test(l.raw))).toBe(true);
    expect(lines.every((l) => !/Здравствуйте/i.test(l.raw))).toBe(true);
  });

  it("strips next-item ordinal glued after qty in packed RFQ", () => {
    const text =
      "Винт ГОСТ ISO 7380-1-М10х25-8.8 – 1700 шт. 2.Винт ГОСТ ISO 7380-1-М8х70-8.8 – 400 шт.";
    const lines = parseInquiryText(text);
    expect(lines).toHaveLength(2);
    expect(lines[0].name).toBe("Винт ГОСТ ISO 7380-1-М10x25-8.8");
    expect(lines[0].quantity).toBe(1700);
    expect(lines[1].name).toBe("Винт ГОСТ ISO 7380-1-М8x70-8.8");
    expect(lines[1].quantity).toBe(400);
    expect(lines[0].name).not.toMatch(/\d+\.\s*$/);
  });

  it("does not treat DIN codes as quantity on compare questions", () => {
    const { parseQuantity } = require("../../../utils/offerKp/parseInquiry");
    expect(parseQuantity("Сравни болты DIN 931 и DIN 933 М10х50")).toBe(1);
    const lines = parseInquiryText("Сравни болты DIN 931 и DIN 933 М10х50");
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].dinNumbers).toEqual(
      expect.arrayContaining(["931", "933"])
    );
  });

  it("extracts ISO/ИСО standards and merges bare qty lines", () => {
    const text = [
      "Винт M6х20 ГОСТ Р ИСО 1207-2013 — 500 шт",
      "Гайка шестигранная нормальная самостопорящаяся М24-5 ГОСТ ISO 7040-2014",
      "28200",
      "Гайка шестигранная высокая самостопорящаяся М16-8-АЗР ГОСТ ISO 7042",
      "71200",
    ].join("\n");
    const lines = parseInquiryText(text);
    expect(lines).toHaveLength(3);
    expect(lines[0].dinNumbers).toContain("1207");
    expect(lines[0].quantity).toBe(500);
    expect(lines[1].dinNumbers).toContain("7040");
    expect(lines[1].quantity).toBe(28200);
    expect(lines[2].dinNumbers).toContain("7042");
    expect(lines[2].quantity).toBe(71200);
  });

  it("does not treat ISO year or M24-5 class digits as quantity", () => {
    const { parseQuantity } = require("../../../utils/offerKp/parseInquiry");
    expect(
      parseQuantity(
        "Гайка шестигранная нормальная самостопорящаяся М24-5 ГОСТ ISO 7040-2014"
      )
    ).toBe(1);
  });
});
