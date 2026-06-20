const {
  normalizeOcrInquiryText,
  splitInquiryChunks,
  parseInquiryText,
} = require("../../../utils/offerKp/parseInquiry");

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
});
