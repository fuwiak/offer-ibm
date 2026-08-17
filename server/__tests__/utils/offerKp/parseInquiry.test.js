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
    const bolt = lines.find((l) => /ГОСТ 7805/i.test(l.name));
    expect(bolt.thread).toEqual({ size: "12", length: "40" });
    expect(bolt.strengthClass).toBe("8.8");
    expect(
      lines.some((l) => l.quantity === 75 && /DIN 7500/i.test(l.name))
    ).toBe(true);
    expect(lines.some((l) => l.quantity === 6 && /Гайка/i.test(l.name))).toBe(
      true
    );
  });

  it("does not stamp кл.пр. onto branded cage nuts from sibling bolts", () => {
    const text = [
      "Болт М6-6gx14.88.019 ГОСТ 7805-70\t2",
      "Гайка СМ230600 (М6) ф.DKC\t36",
      "Гайка М6-6Н.5.019 ГОСТ 5927-70\t6",
    ].join("\n");
    const lines = parseInquiryText(text);
    const dkc = lines.find((l) => /СМ230600/i.test(l.name));
    expect(dkc.name).not.toMatch(/кл\.пр/);
    const gostNut = lines.find((l) => /5927/i.test(l.name));
    expect(gostNut.strengthClass).toBe("5");
    expect(gostNut.name).not.toMatch(/кл\.пр\.8/);
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

  it("parses pasted expected.csv (incl. jammed one-line chat paste)", () => {
    const {
      tryParseExpectedCsvInquiry,
    } = require("../../../utils/offerKp/parseInquiry");
    const csv = [
      "nr,source_name,unit,quantity,matched_sku,matched_name,match_type",
      '1,"Винт ГОСТ ISO 7380-1-М10х25-8.8",шт,1700,073801000100025,"Винт ISO 7380-1 M 10x 25 10.9",analog',
      '2,"Винт ГОСТ ISO 7380-1-М8х70-8.8",шт,400,073801000080070,"Винт ISO 7380-1 M 8x 70 10.9",analog',
    ].join("\n");
    const multi = parseInquiryText(csv);
    expect(multi).toHaveLength(2);
    expect(multi[0]).toMatchObject({
      name: "Винт ГОСТ ISO 7380-1-М10х25-8.8",
      quantity: 1700,
      sku: "073801000100025",
      matchTypeHint: "analog",
    });
    expect(multi[0].name).not.toMatch(/matched_sku|analog|,шт,/);

    const jammed =
      "L-8B nr,source_name,unit,quantity,matched_sku,matched_name,match_type 1,“Винт ГОСТ ISO 7380-1-М10х25-8.8”,шт,1700,073801000100025,“name”,analog 2,“Винт ГОСТ ISO 7380-1-М8х70-8.8”,шт,400,073801000080070,“name2”,analog\n\nсделай кп";
    const fromJammed = tryParseExpectedCsvInquiry(jammed);
    expect(fromJammed).toHaveLength(2);
    expect(fromJammed[0].quantity).toBe(1700);
    expect(fromJammed[1].sku).toBe("073801000080070");
    expect(parseInquiryText(jammed)).toHaveLength(2);
  });

  it("does not treat DIN codes as quantity on compare questions", () => {
    const { parseQuantity } = require("../../../utils/offerKp/parseInquiry");
    expect(parseQuantity("Сравни болты DIN 931 и DIN 933 М10х50")).toBe(1);
    const lines = parseInquiryText("Сравни болты DIN 931 и DIN 933 М10х50");
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].dinNumbers).toEqual(expect.arrayContaining(["931", "933"]));
  });

  it("treats bare ShopDB SKU digits as identity, not quantity", () => {
    const { parseQuantity } = require("../../../utils/offerKp/parseInquiry");
    expect(parseQuantity("003160110060020")).toBe(1);
    const lines = parseInquiryText("003160110060020");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      name: "003160110060020",
      quantity: 1,
      unit: "шт",
    });
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

  it("does not treat catalog pack size in parentheses as RFQ quantity", () => {
    const lines = parseInquiryText("Винт DIN 967 M 6x 20 оцинк (500)");
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].name).toMatch(/\(500\)/);
  });

  it("parses Excel RFQ «запрос кп метизы» TSV into catalog-searchable lines", () => {
    const text = [
      "Наименование работ, материалов\tед.изм\tкол-во",
      "Болт М20×80 10.9 ХЛ (ГОСТ 52644)\tшт\t3872",
      "Гайка М20 10\tшт\t3872",
      "Шайба плоская Ø20\tшт\t7744",
      "Шайба косая Ø20\tшт\t3872",
      "Болт М16×50 8.8\tшт\t1936",
      "Гайка + шайба М16\tшт\t5808",
    ].join("\n");

    const lines = parseInquiryText(text);
    expect(lines.length).toBe(7);

    const boltHv = lines.find((l) => /52644/.test(l.raw));
    expect(boltHv).toMatchObject({ quantity: 3872, unit: "шт" });
    expect(boltHv.name).toMatch(/ГОСТ 52644/);
    expect(boltHv.name).toMatch(/ХЛ/);
    expect(boltHv.thread).toEqual({ size: "20", length: "80" });

    const nutHv = lines.find(
      (l) => /Гайка/i.test(l.name) && /M20|М20/.test(l.name)
    );
    expect(nutHv.dinNumbers).toContain("52645");
    expect(nutHv.quantity).toBe(3872);

    const flat = lines.find((l) => /плоск/i.test(l.name));
    expect(flat.dinNumbers).toContain("125");
    expect(flat.quantity).toBe(7744);

    const bevel = lines.find((l) => /кос/i.test(l.name));
    expect(bevel.dinNumbers).toContain("434");

    const comboNuts = lines.filter(
      (l) => /Гайка/i.test(l.name) && /M16|М16/.test(l.name)
    );
    const comboWashers = lines.filter(
      (l) => /Шайба/i.test(l.name) && /M16|М16/.test(l.name)
    );
    expect(comboNuts.length).toBeGreaterThanOrEqual(1);
    expect(comboWashers.length).toBeGreaterThanOrEqual(1);
    expect(comboNuts[0].quantity).toBe(5808);
    expect(comboWashers[0].quantity).toBe(5808);
    expect(comboNuts[0].raw).toMatch(/кл\.пр\.8|8\.8/);
    expect(comboWashers[0].dinNumbers).toContain("125");
  });
});
