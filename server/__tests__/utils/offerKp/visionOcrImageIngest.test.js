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
});
