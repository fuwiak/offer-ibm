const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { textQualityReport } = require("./pdfTextQuality");
const { assessInquiryTextQuality } = require("./inquiryTextQuality");
const { parseInquiryText } = require("./parseInquiry");
const {
  isImageFilename,
  isVisionOcrFilename,
  resolveOriginalFilePath,
} = require("../parsedFileOriginal");
const { directUploadsPath } = require("../files");
const { safeJsonParse } = require("../http");
const { offerKpLog } = require("../offerKpApp/offerKpLog");
const { ensurePipelineModelLoaded } = require("./offerKpModelPipeline");
const { runQueuedVisionOcr } = require("./queue/runQueuedVisionOcr");

/** Prefer real UUID; never use numeric 0 — DB filename is unique on `${name}-${id}.json`. */
function ensureDocumentId(doc = {}) {
  const raw = doc?.id != null ? String(doc.id).trim() : "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return raw;
  }
  return randomUUID();
}

/**
 * Vision recovery stubs have no collector `location`. Persist pageContent under
 * direct-uploads so WorkspaceParsedFiles.getContextFiles can read it later.
 */
function ensureVisionDocumentOnDisk(doc, originalFilename = "") {
  if (!doc?.pageContent?.trim()) return doc;
  const id = ensureDocumentId(doc);
  if (doc.location) {
    const existing = path.join(directUploadsPath, path.basename(doc.location));
    if (fs.existsSync(existing)) {
      return { ...doc, id };
    }
  }

  if (!fs.existsSync(directUploadsPath)) {
    fs.mkdirSync(directUploadsPath, { recursive: true });
  }

  const safeBase = String(originalFilename || doc.title || "upload")
    .replace(/[^\w.\-()+ ]+/g, "_")
    .replace(/\s+/g, "-")
    .slice(0, 120);
  const fileBase = `${safeBase}-${id}`;
  const destPath = path.join(directUploadsPath, `${fileBase}.json`);
  const payload = {
    id,
    url: `file://${destPath}`,
    title: originalFilename || doc.title || fileBase,
    docAuthor: doc.docAuthor || "no author found",
    description: doc.description || "Vision OCR of uploaded inquiry",
    docSource:
      doc.docSource ||
      (isImageFilename(originalFilename)
        ? "image file uploaded by the user."
        : "pdf file uploaded by the user."),
    chunkSource: doc.chunkSource || "",
    pageContent: doc.pageContent,
    token_count_estimate:
      doc.token_count_estimate ||
      Math.max(1, Math.ceil(String(doc.pageContent).length / 4)),
    ocrEngine: doc.ocrEngine || null,
    ...(doc.ocrLines ? { ocrLines: doc.ocrLines } : {}),
  };
  fs.writeFileSync(destPath, JSON.stringify(payload, null, 2), "utf8");
  return {
    ...doc,
    id,
    location: path.basename(destPath),
    token_count_estimate: payload.token_count_estimate,
  };
}

function isOfferKpVisionOcrEnabled() {
  const flag = String(process.env.OFFER_KP_USE_VISION_OCR ?? "1").trim();
  return flag !== "0" && flag.toLowerCase() !== "false";
}

function assessInquiryTableIntegrity(text = "") {
  const combined = String(text || "");
  const tableLike =
    /наименование\s+товара|\bнаименование\b|кол-?во|потребность\s+на|перечень\s+(?:болтов|товаров)|ведомость\s+монтажных\s+метизов|\bметиз/i.test(
      combined
    );
  const candidateRows = (
    combined.match(
      /(?:болт|винт|гайка|шайба|шуруп|саморез|закл[её]пка)\s+[MММmм]?\s*\d+/giu
    ) || []
  ).length;
  const parsed = parseInquiryText(combined);
  // If parsing produced noticeably MORE logical lines than the raw keyword
  // count, a single product likely got split across rows (OCR line-wrap
  // corruption, e.g. size spec landing on its own line) — none of the
  // resulting rows can be trusted even if each looks individually complete.
  // (Checking each row's unit against `line.raw` doesn't work: parseInquiryText
  // already strips the unit into `line.unit` for structured/table input, so
  // that check always failed and flagged every clean table as low quality.)
  const overSegmented =
    candidateRows > 0 && parsed.length > candidateRows * 1.15 + 0.5;
  const usableRows = overSegmented
    ? 0
    : parsed.filter(
        (line) =>
          line?.productTypes?.length > 0 &&
          line?.thread &&
          line?.dinNumbers?.length > 0 &&
          Number.isFinite(Number(line?.quantity))
      ).length;
  const needsReocr =
    tableLike && candidateRows >= 3 && usableRows < candidateRows * 0.8;
  return { tableLike, candidateRows, usableRows, needsReocr };
}

function documentsNeedVisionOcr(documents = []) {
  const combined = documents.map((d) => d?.pageContent || "").join("\n");
  // Empty collector output (typical for photo/Tesseract miss) → must run VL.
  if (!String(combined || "").trim()) return true;
  const pageCount = Math.max(1, documents.length);
  const pdfReport = textQualityReport(combined, pageCount);
  const inquiryReport = assessInquiryTextQuality(combined);
  const tableReport = assessInquiryTableIntegrity(combined);
  return (
    pdfReport.needsOcr || inquiryReport.needsReocr || tableReport.needsReocr
  );
}

function isVisionOcrImprovement(beforeText, afterText) {
  const before = assessInquiryTextQuality(beforeText);
  const after = assessInquiryTextQuality(afterText);
  const beforeTable = assessInquiryTableIntegrity(beforeText);
  const afterTable = assessInquiryTableIntegrity(afterText);
  if (afterTable.usableRows > beforeTable.usableRows) return true;
  if (afterTable.needsReocr && !beforeTable.needsReocr) return false;
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
 * Resident Qwen3-VL corrects collector/Tesseract text when table integrity is bad.
 * Also runs for uploaded photos (images) — Tesseract alone is not enough for RFQ scans.
 */
async function enrichDocumentsWithOfferKpOcr({
  documents = [],
  originalLocation = null,
  originalFilename = "",
  workspace = null,
  onProgress = null,
  force = false,
} = {}) {
  if (!isOfferKpVisionOcrEnabled()) return documents;
  if (!originalLocation || !isVisionOcrFilename(originalFilename)) {
    return documents;
  }
  const isImage = isImageFilename(originalFilename);
  // Photos: always prefer Qwen-VL. PDFs: only when collector text is weak/empty.
  if (!force && !isImage && !documentsNeedVisionOcr(documents)) {
    return documents;
  }

  const pdfPath = resolveOriginalFilePath(originalLocation);
  if (!pdfPath) return documents;

  const beforeText = documents.map((d) => d?.pageContent || "").join("\n");

  onProgress?.({
    type: "stage",
    stage: "vision-ocr",
    filename: originalFilename,
  });

  try {
    const ocrResult = await runQueuedVisionOcr(pdfPath, {
      workspace,
      contextText: beforeText,
      originalFilename,
      onProgress,
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

    if (!isImage && !force && !isVisionOcrImprovement(beforeText, text)) {
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
        isImage,
      }
    );

    let updated = applyVisionOcrText(documents, text, { engine, lines });
    updated = updated.map((doc, index) =>
      index === 0 ? ensureVisionDocumentOnDisk(doc, originalFilename) : doc
    );
    if (!persistDocumentPageContent(updated[0])) {
      // ensureVisionDocumentOnDisk already wrote when location was missing;
      // persistDocumentPageContent only updates an existing collector JSON.
      if (!updated[0]?.location) {
        offerKpLog(
          "warn",
          "OfferKP ingest: vision OCR text not persisted to disk",
          {
            filename: originalFilename,
            location: updated[0]?.location || null,
          }
        );
      }
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

/**
 * When collector returns nothing (empty Tesseract on photo), still OCR the
 * archived original and build a synthetic document for chat context.
 */
async function ocrArchivedOriginalAsDocuments({
  originalLocation = null,
  originalFilename = "",
  workspace = null,
  onProgress = null,
} = {}) {
  if (!isOfferKpVisionOcrEnabled()) return [];
  if (!originalLocation || !isVisionOcrFilename(originalFilename)) return [];

  const stub = [
    {
      id: randomUUID(),
      title: originalFilename,
      pageContent: "",
      docSource: isImageFilename(originalFilename)
        ? "image file uploaded by the user."
        : "pdf file uploaded by the user.",
      token_count_estimate: 0,
    },
  ];
  const enriched = await enrichDocumentsWithOfferKpOcr({
    documents: stub,
    originalLocation,
    originalFilename,
    workspace,
    onProgress,
    force: true,
  });
  const text = enriched?.[0]?.pageContent || "";
  if (!text.trim()) return [];
  return enriched.map((doc, index) =>
    index === 0 ? ensureVisionDocumentOnDisk(doc, originalFilename) : doc
  );
}

module.exports = {
  isOfferKpVisionOcrEnabled,
  assessInquiryTableIntegrity,
  documentsNeedVisionOcr,
  enrichDocumentsWithOfferKpOcr,
  ocrArchivedOriginalAsDocuments,
  ensureDocumentId,
  ensureVisionDocumentOnDisk,
};
