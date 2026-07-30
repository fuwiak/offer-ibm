"use strict";

const {
  isPdfFilename,
  isImageFilename,
  isVisionOcrFilename,
  imageMimeFromFilename,
} = require("../../../utils/parsedFileOriginal");
const {
  documentsNeedVisionOcr,
} = require("../../../utils/offerKp/offerKpDocumentIngest");

describe("parsedFileOriginal vision targets", () => {
  it("detects pdf and image filenames", () => {
    expect(isPdfFilename("a.PDF")).toBe(true);
    expect(isImageFilename("scan.JPG")).toBe(true);
    expect(isImageFilename("photo.webp")).toBe(true);
    expect(isVisionOcrFilename("rfq.png")).toBe(true);
    expect(isVisionOcrFilename("notes.txt")).toBe(false);
  });

  it("maps mime from extension", () => {
    expect(imageMimeFromFilename("a.jpg")).toBe("image/jpeg");
    expect(imageMimeFromFilename("a.PNG")).toBe("image/png");
  });
});

describe("documentsNeedVisionOcr", () => {
  it("requires vision OCR when collector text is empty", () => {
    expect(documentsNeedVisionOcr([{ pageContent: "" }])).toBe(true);
    expect(documentsNeedVisionOcr([{ pageContent: "   " }])).toBe(true);
  });

  it("flags ведомость метизов with weak structured rows for re-OCR", () => {
    const text = [
      "ВЕДОМОСТЬ МОНТАЖНЫХ МЕТИЗОВ",
      "Наименование  Диаметр  Длина  Кол-во  ГОСТ",
      "Болт  16  55  120  7798-70",
      "Болт  20  60  80  7798-70",
      "Гайка  16  —  200  5915-70",
      "Шайба  16  —  200  11371-78",
    ].join("\n");
    expect(documentsNeedVisionOcr([{ pageContent: text }])).toBe(true);
  });
});

describe("inquiryTextFromOcrJsonLines", () => {
  const {
    inquiryTextFromOcrJsonLines,
  } = require("../../../utils/offerKp/offerKpVisionOcr");

  it("composes catalog name from ведомость columns", () => {
    const text = inquiryTextFromOcrJsonLines([
      {
        name_verbatim: "Болт",
        diameter_mm: 16,
        length_mm: 55,
        gost: "7798-70",
        strength_class: "8.8",
        coating: "оцинк.",
        quantity: 120,
        unit: "шт",
      },
    ]);
    expect(text).toMatch(/Болт\s+М16×55/i);
    expect(text).toMatch(/ГОСТ\s+7798-70/i);
    expect(text).toMatch(/кл\.8\.8/);
    expect(text).toMatch(/оцинк/);
    expect(text).toMatch(/120\s+шт/);
  });
});
