const fs = require("fs");
const path = require("path");
const {
  textQualityReport,
} = require("../../../collector/processSingleFile/convert/asPDF/pdfTextQuality");
const {
  resolveOfferKpChatModel,
} = require("../../config/offerKp.models");
const {
  isPdfFilename,
  resolveOriginalFilePath,
} = require("../parsedFileOriginal");
const { directUploadsPath } = require("../files");
const { safeJsonParse } = require("../http");
const { offerKpLog } = require("../offerKpApp/offerKpLog");
const { loadLmStudioModelForTask } = require("../offerKpApp/lmStudioModels");
const { paddleOcrPdf } = require("./offerKpPaddleOcr");

function isOfferKpPaddleOcrEnabled() {
  const flag = String(process.env.OFFER_KP_USE_PADDLE_OCR ?? "1").trim();
  return flag !== "0" && flag.toLowerCase() !== "false";
}

function documentsNeedPaddleOcr(documents = []) {
  const combined = documents.map((d) => d?.pageContent || "").join("\n");
  const pageCount = Math.max(1, documents.length);
  return textQualityReport(combined, pageCount).needsOcr;
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
 * Qwen3-VL-8B Thinking — чат/письмо; PaddleOCR-VL — чтение PDF при плохом текстовом слое.
 * После OCR возвращает chat-модель в VRAM.
 */
async function enrichDocumentsWithOfferKpOcr({
  documents = [],
  originalLocation = null,
  originalFilename = "",
  workspace = null,
  onProgress = null,
} = {}) {
  if (!isOfferKpPaddleOcrEnabled()) return documents;
  if (!originalLocation || !isPdfFilename(originalFilename)) return documents;
  if (!documentsNeedPaddleOcr(documents)) return documents;

  const pdfPath = resolveOriginalFilePath(originalLocation);
  if (!pdfPath) return documents;

  const chatModel = resolveOfferKpChatModel(workspace);

  onProgress?.({
    type: "stage",
    stage: "paddle-ocr",
    filename: originalFilename,
  });

  try {
    const text = await paddleOcrPdf(pdfPath, {
      onProgress,
      onPage: ({ pageNumber, total }) => {
        onProgress?.({
          type: "ocr_progress",
          engine: "paddleocr-vl",
          page: pageNumber,
          total,
        });
      },
    });

    if (!text?.trim()) return documents;

    offerKpLog("info", "OfferKP ingest: PaddleOCR replaced collector text", {
      filename: originalFilename,
      chars: text.length,
    });

    if (documents.length <= 1) {
      const base = documents[0] || { id: 0 };
      const updated = [
        {
          ...base,
          pageContent: text,
          ocrEngine: "paddleocr-vl",
        },
      ];
      persistDocumentPageContent(updated[0]);
      return updated;
    }

    const updated = documents.map((doc, index) =>
      index === 0
        ? { ...doc, pageContent: text, ocrEngine: "paddleocr-vl" }
        : { ...doc, pageContent: "", ocrEngine: "paddleocr-vl" }
    );
    persistDocumentPageContent(updated[0]);
    return updated;
  } catch (error) {
    offerKpLog("warn", "OfferKP PaddleOCR ingest failed — keeping collector text", {
      filename: originalFilename,
      error: error?.message || String(error),
    });
    return documents;
  } finally {
    try {
      await loadLmStudioModelForTask("chat", { workspace, force: true });
      offerKpLog("info", "OfferKP ingest: restored chat model in VRAM", {
        model: chatModel,
      });
    } catch (error) {
      offerKpLog("warn", "OfferKP ingest: failed to restore chat model", {
        model: chatModel,
        error: error?.message || String(error),
      });
    }
  }
}

module.exports = {
  isOfferKpPaddleOcrEnabled,
  documentsNeedPaddleOcr,
  enrichDocumentsWithOfferKpOcr,
};
