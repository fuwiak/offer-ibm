const fs = require("fs");
const path = require("path");
const { textQualityReport } = require("./pdfTextQuality");
const { assessInquiryTextQuality } = require("./inquiryTextQuality");
const {
  isPdfFilename,
  resolveOriginalFilePath,
} = require("../parsedFileOriginal");
const { directUploadsPath } = require("../files");
const { safeJsonParse } = require("../http");
const { offerKpLog } = require("../offerKpApp/offerKpLog");
const { visionOcrPdf } = require("./offerKpVisionOcr");
const { ensurePipelineModelLoaded } = require("./offerKpModelPipeline");

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

function isVisionOcrImprovement(beforeText, afterText) {
  const before = assessInquiryTextQuality(beforeText);
  const after = assessInquiryTextQuality(afterText);
  if (after.ok && !before.ok) return true;
  if (after.garbledHeaders < before.garbledHeaders) return true;
  if (after.mixedScriptWords < before.mixedScriptWords) return true;
  if (!after.ok && before.ok) return false;
  return afterText.trim().length > beforeText.trim().length * 0.5;
}

function persistDocumentPageContent(doc) {
  const location = doc?.location;
  if (!location || !doc?.pageContent) return false;

  const sourceFile = path.join(directUploadsPath, path.basename(location));
  if (!fs.existsSync(sourceFile)) {
    offerKpLog("warn", "OfferKP ingest: parsed JSON not found for persist", {
      location,
    });
    return false;
  }

  const data = safeJsonParse(fs.readFileSync(sourceFile, "utf-8"), {});
  data.pageContent = doc.pageContent;
  if (doc.ocrEngine) data.ocrEngine = doc.ocrEngine;
  if (doc.ocrLines) data.ocrLines = doc.ocrLines;
  fs.writeFileSync(sourceFile, JSON.stringify(data));
  return true;
}

function applyVisionOcrText(documents, text, meta = {}) {
  const engine = meta.engine || "qwen3-vl-thinking-json";
  const ocrLines = meta.lines || null;
  if (documents.length <= 1) {
    const base = documents[0] || { id: 0 };
    return [
      {
        ...base,
        pageContent: text,
        ocrEngine: engine,
        ...(ocrLines ? { ocrLines } : {}),
      },
    ];
  }
  return documents.map((doc, index) =>
    index === 0
      ? {
          ...doc,
          pageContent: text,
          ocrEngine: engine,
          ...(ocrLines ? { ocrLines } : {}),
        }
      : { ...doc, pageContent: "", ocrEngine: engine }
  );
}

/**
 * Eyes (Qwen3-VL Thinking) when collector/Tesseract text is bad.
 * After OCR, swap VRAM back to agent brain (gpt-oss-20b).
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

  const beforeText = documents.map((d) => d?.pageContent || "").join("\n");

  onProgress?.({
    type: "stage",
    stage: "vision-ocr",
    filename: originalFilename,
  });

  try {
    const ocrResult = await visionOcrPdf(pdfPath, {
      workspace,
      onPage: ({ pageNumber, total }) => {
        onProgress?.({
          type: "ocr_progress",
          engine: "qwen3-vl-thinking-json",
          page: pageNumber,
          total,
        });
      },
    });

    const text =
      typeof ocrResult === "string" ? ocrResult : ocrResult?.text || "";
    const lines =
      typeof ocrResult === "object" && ocrResult ? ocrResult.lines : null;
    const engine =
      (typeof ocrResult === "object" && ocrResult?.engine) ||
      "qwen3-vl-thinking-json";

    if (!text?.trim()) {
      await ensurePipelineModelLoaded("agent", { workspace }).catch(() => null);
      return documents;
    }

    if (!isVisionOcrImprovement(beforeText, text)) {
      offerKpLog(
        "warn",
        "OfferKP ingest: vision OCR skipped — not better than collector",
        {
          filename: originalFilename,
          beforeChars: beforeText.length,
          afterChars: text.length,
        }
      );
      await ensurePipelineModelLoaded("agent", { workspace }).catch(() => null);
      return documents;
    }

    offerKpLog(
      "info",
      "OfferKP ingest: Qwen-VL vision OCR replaced collector text",
      {
        filename: originalFilename,
        chars: text.length,
        format: lines ? "json" : "text",
        engine,
      }
    );

    const updated = applyVisionOcrText(documents, text, { engine, lines });
    if (!persistDocumentPageContent(updated[0])) {
      offerKpLog(
        "warn",
        "OfferKP ingest: vision OCR text not persisted to disk",
        {
          filename: originalFilename,
          location: updated[0]?.location || null,
        }
      );
    }

    onProgress?.({
      type: "stage",
      stage: "pipeline-agent-load",
      filename: originalFilename,
    });
    await ensurePipelineModelLoaded("agent", { workspace }).catch((error) => {
      offerKpLog("warn", "OfferKP ingest: failed to restore agent brain", {
        error: error?.message || String(error),
      });
    });

    return updated;
  } catch (error) {
    offerKpLog(
      "warn",
      "OfferKP vision OCR ingest failed — keeping collector text",
      {
        filename: originalFilename,
        error: error?.message || String(error),
      }
    );
    await ensurePipelineModelLoaded("agent", { workspace }).catch(() => null);
    return documents;
  }
}

module.exports = {
  isOfferKpVisionOcrEnabled,
  documentsNeedVisionOcr,
  enrichDocumentsWithOfferKpOcr,
};
