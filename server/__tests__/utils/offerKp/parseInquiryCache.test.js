/* eslint-env jest, node */

const {
  parseInquiryText,
  clearParseInquiryCache,
} = require("../../../utils/offerKp/parseInquiry");

describe("parseInquiryText cache", () => {
  beforeEach(() => clearParseInquiryCache());
  afterEach(() => clearParseInquiryCache());

  it("returns identical results for repeated input", () => {
    const text = "1. Болт DIN 933 M10x70 8.8 оцинк — 120 шт";
    const first = parseInquiryText(text);
    const second = parseInquiryText(text);
    expect(second).toEqual(first);
    expect(second[0].quantity).toBe(120);
  });

  it("never leaks caller mutations back into the cache", () => {
    const text = "1. Гайка DIN 934 M12 — 50 шт";
    const first = parseInquiryText(text);
    first[0].quantity = 999999;
    first[0].thread = "thread-abc";
    const second = parseInquiryText(text);
    expect(second[0].quantity).toBe(50);
    expect(second[0].thread).not.toBe("thread-abc");
    expect(second[0]).not.toBe(first[0]);
  });

  it("differentiates inputs by content hash", () => {
    const a = parseInquiryText("Болт DIN 933 M10x70 — 10 шт");
    const b = parseInquiryText("Болт DIN 933 M10x80 — 10 шт");
    expect(a[0].name).not.toBe(b[0].name);
  });
});
