const fs = require("fs");
const path = require("path");
const {
  textQualityReport,
} = require("../../../collector/processSingleFile/convert/asPDF/pdfTextQuality");
const { assessInquiryTextQuality } = require("./inquiryTextQuality");
const {
  isPdfFilename,
  resolveOriginalFilePath,
} = require("../parsedFileOriginal");
const { directUploadsPath } = require("../files");
const { safeJsonParse } = require("../http");
const { offerKpLog } = require("../offerKpApp/offerKpLog");
const { visionOcrPdf } = require("./offerKpVisionOcr");

function isOfferKpVisionOcrEnabled() {
  const flag = String(process.env.OFFER_KP_USE_VISION_OCR ?? "1").trim();
  return flag !== "0" && flag.toLowerCase() !== "false";
}

function documentsNeedVisionOcr(documents = []) {
  const combined = documents.map((d) => d?.pageContent || "").join("\n");
  const pageCount = Math.max(1, documents.length);
  const pdfReport = textQualityReport(combined, pageCount);
  const inquiryReport = assessInquiryTextQuality(combined);
  return pdfReport.needsOcr || inquiryReport.needsReocr;
}

function persistDocumentPageContent(doc) {
  const location = doc?.location;
  if (!location || !doc?.pageContent) return false;

  const sourceFile = path.join(directUploadsPath, path.basename(location));
  if (!fs.existsSync(sourceFile)) return false;

  const data = safeJsonParse(fs.readFileSync(sourceFile, "utf-8"), {});
  data.pageContent = doc.pageContent;
  if (doc.ocrEngine) data.ocrEngine = doc.ocrEngine;
  fs.writeFileSync(sourceFile, JSON.stringify(data));
  return true;
}

/**
 * Qwen3-VL-8B Thinking — и КП, и vision-OCR при битом тексте collector/Tesseract.
 */
async function enrichDocumentsWithOfferKpOcr({
  documents = [],
  originalLocation = null,
  originalFilename = "",
  workspace = null,
  onProgress = null,
} = {}) {
  if (!isOfferKpVisionOcrEnabled()) return documents;
  if (!originalLocation || !isPdfFilename(originalFilename)) return documents;
  if (!documentsNeedVisionOcr(documents)) return documents;

  const pdfPath = resolveOriginalFilePath(originalLocation);
  if (!pdfPath) return documents;

  onProgress?.({
    type: "stage",
    stage: "vision-ocr",
    filename: originalFilename,
  });

  try {
    const text = await visionOcrPdf(pdfPath, {
      workspace,
      onProgress,
      onPage: ({ pageNumber, total }) => {
        onProgress?.({
          type: "ocr_progress",
          engine: "qwen3-vl",
          page: pageNumber,
          total,
        });
      },
    });

    if (!text?.trim()) return documents;

    offerKpLog("info", "OfferKP ingest: Qwen-VL vision OCR replaced collector text", {
      filename: originalFilename,
      chars: text.length,
    });

    if (documents.length <= 1) {
      const base = documents[0] || { id: 0 };
      const updated = [
        {
          ...base,
          pageContent: text,
          ocrEngine: "qwen3-vl",
        },
      ];
      persistDocumentPageContent(updated[0]);
      return updated;
    }

    const updated = documents.map((doc, index) =>
      index === 0
        ? { ...doc, pageContent: text, ocrEngine: "qwen3-vl" }
        : { ...doc, pageContent: "", ocrEngine: "qwen3-vl" }
    );
    persistDocumentPageContent(updated[0]);
    return updated;
  } catch (error) {
    offerKpLog("warn", "OfferKP vision OCR ingest failed — keeping collector text", {
      filename: originalFilename,
      error: error?.message || String(error),
    });
    return documents;
  }
}

module.exports = {
  isOfferKpVisionOcrEnabled,
  documentsNeedVisionOcr,
  enrichDocumentsWithOfferKpOcr,
};
