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
const {
  prepareVisionImageBuffer,
} = require("../../../utils/offerKp/visionImagePrep");

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

  it("does not duplicate Cyrillic М size already in name", () => {
    const text = inquiryTextFromOcrJsonLines([
      {
        name_verbatim: "Болт М10х100 ГОСТ 7805-70",
        diameter_mm: 10,
        length_mm: 100,
        quantity: 30,
        unit: "шт",
      },
    ]);
    expect(text).toBe("1. Болт М10х100 ГОСТ 7805-70 — 30 шт");
  });

  it("moves wrench size S16 out of strength_class into the name", () => {
    const {
      sanitizeOcrLine,
    } = require("../../../utils/offerKp/offerKpVisionOcr");
    const cleaned = sanitizeOcrLine({
      name_verbatim: "Болт М10х100 ГОСТ 7805-70",
      strength_class: "S16",
      quantity: 30,
      unit: "шт",
    });
    expect(cleaned.strength_class).toBeNull();
    expect(cleaned.name_verbatim).toMatch(/\(S16\)/);
    const text = inquiryTextFromOcrJsonLines([
      {
        name_verbatim: "Болт М10х100 ГОСТ 7805-70",
        strength_class: "S16",
        quantity: 30,
        unit: "шт",
      },
    ]);
    expect(text).toMatch(/\(S16\)/);
    expect(text).not.toMatch(/кл\.S16/i);
  });
});

describe("validateOcrLines retry gate", () => {
  const {
    validateOcrLines,
  } = require("../../../utils/offerKp/offerKpVisionOcr");

  it("treats missing unit as warning, not hard error", () => {
    const result = validateOcrLines([
      { name_verbatim: "Болт М16×55", quantity: 10 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => /missing_unit/.test(w))).toBe(true);
  });

  it("rejects empty extraction as hard error", () => {
    const result = validateOcrLines([]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("no_rows_extracted");
  });
});

describe("prepareVisionImageBuffer", () => {
  it("downscales oversized JPEG and returns image/jpeg", async () => {
    let sharp;
    try {
      sharp = require("../../../../collector/node_modules/sharp");
    } catch {
      return; // sharp optional in CI without collector deps
    }
    const input = await sharp({
      create: {
        width: 2400,
        height: 3200,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    })
      .jpeg()
      .toBuffer();

    const prepared = await prepareVisionImageBuffer(input, { maxEdge: 800 });
    expect(prepared.mime).toBe("image/jpeg");
    const meta = await sharp(prepared.buffer).metadata();
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(800);
    expect(prepared.buffer.length).toBeLessThan(input.length);
  });
});
