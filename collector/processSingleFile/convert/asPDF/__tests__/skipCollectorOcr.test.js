"use strict";

/**
 * Unit tests for OfferKP skipCollectorOcr fast-path in asPDF.
 * Mocks PDFLoader so we don't need a real PDF binary in CI.
 */

jest.mock("../../../../utils/files", () => ({
  createdDate: () => new Date().toISOString(),
  trashFile: jest.fn(),
  writeToServerDocuments: jest.fn(({ data, filename }) => ({
    ...data,
    location: filename,
  })),
}));

jest.mock("../../../../utils/tokenizer", () => ({
  tokenizeString: (s) => String(s || "").length,
}));

jest.mock("../../../../utils/parseCache", () => ({
  buildKey: (...parts) => parts.join(":"),
  remember: async (_key, fn) => fn(),
}));

const mockOcrPDFNative = jest.fn();
const mockOcrPDF = jest.fn();
const mockNativePipelineAvailable = jest.fn(async () => true);

jest.mock("../../../../utils/OCRLoader", () => {
  const actual = jest.requireActual("../../../../utils/OCRLoader");
  function MockOCRLoader() {
    this.nativePipelineAvailable = mockNativePipelineAvailable;
    this.ocrPDFNative = mockOcrPDFNative;
    this.ocrPDF = mockOcrPDF;
  }
  return Object.assign(MockOCRLoader, {
    isLikelyGarbledText: actual.isLikelyGarbledText,
    textQualityScore: actual.textQualityScore,
  });
});

jest.mock("../PDFLoader", () => {
  return jest.fn().mockImplementation(() => ({
    load: async () => [
      {
        pageContent: "",
        metadata: { loc: { pageNumber: 1 }, pdf: { info: {} } },
      },
    ],
  }));
});

describe("asPDF skipCollectorOcr", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("defers OCR immediately when skipCollectorOcr and no text layer", async () => {
    const asPdf = require("../index");

    const result = await asPdf({
      fullFilePath: "/tmp/fake-scan.pdf",
      filename: "Slozhnost_vysokaya_1.pdf",
      options: { skipCollectorOcr: true, absolutePath: true, parseOnly: true },
    });

    expect(result.success).toBe(false);
    expect(result.documents).toEqual([]);
    expect(String(result.reason || "")).toMatch(/Deferred to Vision OCR/i);
    expect(mockOcrPDFNative).not.toHaveBeenCalled();
    expect(mockOcrPDF).not.toHaveBeenCalled();
  });
});
