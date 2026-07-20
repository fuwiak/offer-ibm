const {
  assessInquiryTextQuality,
  validateInquiryLines,
  isLikelyPriceToken,
} = require("../../../utils/offerKp/inquiryTextQuality");
const { parseInquiryText } = require("../../../utils/offerKp/parseInquiry");
const {
  assessInquiryTableIntegrity,
} = require("../../../utils/offerKp/offerKpDocumentIngest");

describe("inquiryTextQuality", () => {
  it("detects garbled OCR headers from logs", () => {
    const garbled =
      "otbetctbennый naimenobanie пotpeбnoctь icпoлniteль пpiлoжenie";
    const report = assessInquiryTextQuality(garbled);
    expect(report.ok).toBe(false);
    expect(report.needsReocr).toBe(true);
  });

  it("accepts clean slozhnost fixture style text", () => {
    const clean =
      "Наименование товара | Ед. изм. | Кол-во | Болт M10x100 ГОСТ 7805 | кг | 30";
    const report = assessInquiryTextQuality(clean);
    expect(report.ok).toBe(true);
  });
});

describe("parseInquiry price vs quantity", () => {
  it("does not treat decimal price as quantity", () => {
    const lines = parseInquiryText(
      "| 1 | Болт M10x100 ГОСТ 7805 | кг | 30 | 270.10 |"
    );
    expect(lines[0]?.quantity).toBe(30);
    expect(lines[0]?.quantity).not.toBe(270);
  });

  it("flags price-like tokens", () => {
    expect(isLikelyPriceToken("270.10")).toBe(true);
    expect(isLikelyPriceToken("30")).toBe(false);
  });
});

describe("inquiry table integrity", () => {
  it("rejects a table where OCR lost quantity units and split product rows", () => {
    const broken = [
      "Перечень болтов",
      "Наименование товара | Потребность на первое полугодие | Кол-во",
      "Болт M10x100 ГОСТ 7805-70 D10мм KT 30",
      "Болт M10x20 ГОСТ 7805-70 D10мм KT 14",
      "Болт M10x35 ГОСТ 7805-70 D10мм",
      "L35мм с гайкой",
    ].join("\n");
    const report = assessInquiryTableIntegrity(broken);
    expect(report.candidateRows).toBe(3);
    expect(report.usableRows).toBe(0);
    expect(report.needsReocr).toBe(true);
  });

  it("accepts a complete structured table", () => {
    const clean = [
      "Наименование товара | Кол-во",
      "Болт M10x100 ГОСТ 7805-70 | кг | 30",
      "Болт M10x20 ГОСТ 7805-70 | кг | 14",
      "Болт M10x35 ГОСТ 7805-70 | кг | 50",
    ].join("\n");
    const report = assessInquiryTableIntegrity(clean);
    expect(report.candidateRows).toBe(3);
    expect(report.usableRows).toBe(3);
    expect(report.needsReocr).toBe(false);
  });
});
