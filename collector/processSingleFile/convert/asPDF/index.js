const { v4 } = require("uuid");
const {
  createdDate,
  trashFile,
  writeToServerDocuments,
} = require("../../../utils/files");
const { tokenizeString } = require("../../../utils/tokenizer");
const { default: slugify } = require("slugify");
const PDFLoader = require("./PDFLoader");
const OCRLoader = require("../../../utils/OCRLoader");
const { isLikelyGarbledText } = require("../../../utils/OCRLoader");
const { SmartOCRAgent } = require("../../../utils/SmartOCRAgent");
const { extractWithOpenDataLoader } = require("../../../utils/openDataLoader");
const { shouldOcrInsteadOfPdfText, textQualityReport } = require("./pdfTextQuality");
const parseCache = require("../../../utils/parseCache");

// Number of leading pages probed before committing to a full OCR run. If these
// pages contain no readable text we abort immediately instead of wasting time
// on the whole (likely unreadable) document.
const PROBE_PAGES = 2;

const UNREADABLE_SCAN_MESSAGE =
  "Первые страницы документа не содержат распознаваемого текста " +
  "(возможно, скан низкого качества или повреждённый файл). Обработка остановлена.";

/**
 * Извлекает текст страниц из PDF (цифровой слой → SmartOCRAgent → OCRLoader).
 * Это самая дорогая часть (OCR), поэтому результат кэшируется по «ленивому»
 * отпечатку файла — повторная загрузка того же PDF не запускает OCR заново.
 * @returns {Promise<{pageContent: string, metadata: object}[]>}
 */
async function extractPdfDocs({ fullFilePath, filename, options }) {
  const onProgress =
    typeof options?.onProgress === "function" ? options.onProgress : null;
  const emit = (event) => {
    if (!onProgress) return;
    try {
      onProgress(event);
    } catch (_) {
      /* progress must never break extraction */
    }
  };

  emit({ type: "stage", stage: "loading" });
  const pdfLoader = new PDFLoader(fullFilePath, { splitPages: true });
  let docs = await pdfLoader.load();

  // ── Step 1: decide whether the digital text layer is usable ─────────────────
  const rawText = docs.map((d) => d.pageContent || "").join("");
  const pageCount = docs.length;
  const report = textQualityReport(rawText, pageCount);

  // ── Step 0: try opendataloader-pdf first (fast, high-quality reading order) ──
  // It is optional (requires Java + the @opendataloader/pdf package); when it
  // returns usable text we skip the heavier OCR pipeline entirely.
  if (docs.length === 0 || report.needsOcr) {
    const odl = await extractWithOpenDataLoader(fullFilePath);
    if (odl && !shouldOcrInsteadOfPdfText(odl, 1)) {
      console.log(`[asPDF] opendataloader-pdf produced usable text for ${filename}.`);
      emit({ type: "stage", stage: "finalizing" });
      return [{ pageContent: odl, metadata: { source: fullFilePath } }];
    }
  }

  if (docs.length === 0 || report.needsOcr) {
    console.log(
      `[asPDF] ${
        docs.length === 0 ? "No text layer" : "Low-quality text layer"
      } for ${filename} — ` +
      `alnumRatio=${report.alnumRatio}, charsPerPage=${report.charsPerPage}. ` +
      `Running OCR pipeline.`
    );

    const loader = new OCRLoader({ targetLanguages: options?.ocr?.langList });
    const totalPages = pageCount || null;
    const useNative = await loader.nativePipelineAvailable();

    if (useNative) {
      // ── Reliable path: full-page render via pdftoppm + native tesseract. ────
      // Probe the first pages and bail out early if they are unreadable so we
      // do not waste minutes OCR-ing a broken/unreadable scan.
      emit({ type: "stage", stage: "ocr" });
      const probeDocs = await loader.ocrPDFNative(fullFilePath, {
        firstPage: 1,
        lastPage: PROBE_PAGES,
        totalPagesHint: totalPages,
        onPage: ({ pageNumber }) =>
          emit({ type: "page", pageNumber, totalPages: totalPages || 0 }),
      });
      const probeText = probeDocs.map((d) => d.pageContent || "").join("\n");

      if (isLikelyGarbledText(probeText)) {
        console.warn(
          `[asPDF] First ${PROBE_PAGES} page(s) unreadable for ${filename}; aborting OCR early.`
        );
        const err = new Error(UNREADABLE_SCAN_MESSAGE);
        err.code = "UNREADABLE_SCAN";
        throw err;
      }

      // First pages are readable → OCR the remaining pages.
      let restDocs = [];
      if (!totalPages || totalPages > PROBE_PAGES) {
        restDocs = await loader.ocrPDFNative(fullFilePath, {
          firstPage: PROBE_PAGES + 1,
          lastPage: null,
          totalPagesHint: totalPages,
          onPage: ({ pageNumber }) =>
            emit({ type: "page", pageNumber, totalPages: totalPages || 0 }),
        });
      }
      docs = [...probeDocs, ...restDocs];
    } else if (onProgress) {
      // No native pipeline but caller wants live progress → tesseract.js stream.
      emit({ type: "stage", stage: "ocr" });
      docs = await loader.ocrPDF(fullFilePath, {
        maxExecutionTime: options?.ocr?.timeout ?? 300_000,
        batchSize: options?.ocr?.batchSize ?? 10,
        onPage: ({ pageNumber, totalPages: tp }) =>
          emit({ type: "page", pageNumber, totalPages: tp }),
      });
    } else {
      // ── Fallback: SmartOCRAgent fast-path (stops on first good result) ──────
      const agent = new SmartOCRAgent({
        timeout: options?.ocr?.timeout ?? 300_000,
        stopOnFirstGood: true,
      });
      const agentResult = await agent.processPDF(fullFilePath);

      if (agentResult && agentResult.score.isAcceptable) {
        console.log(
          `[asPDF] SmartOCRAgent succeeded via "${agentResult.strategyUsed}" ` +
          `(${agentResult.score.words} words).`
        );
        docs = [
          { pageContent: agentResult.text, metadata: { source: fullFilePath } },
        ];
      } else {
        console.log(
          `[asPDF] SmartOCRAgent exhausted. Falling back to deep OCRLoader.`
        );
        docs = await loader.ocrPDF(fullFilePath, {
          maxExecutionTime: options?.ocr?.timeout ?? 300_000,
          batchSize: options?.ocr?.batchSize ?? 10,
        });
      }
    }
  }

  emit({ type: "stage", stage: "finalizing" });
  return docs;
}

async function asPdf({
  fullFilePath = "",
  filename = "",
  options = {},
  metadata = {},
}) {
  console.log(`-- Working ${filename} --`);
  const pageContent = [];

  // Кэш-ключ зависит от содержимого файла и языков OCR (влияют на результат).
  const cacheKey = parseCache.buildKey(fullFilePath, [
    "pdf",
    options?.ocr?.langList || "default",
  ]);

  let docs;
  try {
    docs = await parseCache.remember(cacheKey, () =>
      extractPdfDocs({ fullFilePath, filename, options })
    );
  } catch (e) {
    // Early abort: first pages had no readable text — report immediately
    // instead of processing the rest of an unreadable document.
    if (e?.code === "UNREADABLE_SCAN") {
      console.error(`[asPDF] ${filename}: ${e.message}`);
      if (!options.absolutePath) trashFile(fullFilePath);
      return { success: false, reason: e.message, documents: [] };
    }
    throw e;
  }

  for (const doc of docs) {
    console.log(
      `-- Parsing content from pg ${
        doc.metadata?.loc?.pageNumber || "unknown"
      } --`
    );
    if (!doc.pageContent || !doc.pageContent.length) continue;
    pageContent.push(doc.pageContent);
  }

  if (!pageContent.length) {
    console.error(`[asPDF] Resulting text content was empty for ${filename}.`);
    if (!options.absolutePath) trashFile(fullFilePath);
    return {
      success: false,
      reason: `No text content found in ${filename}.`,
      documents: [],
    };
  }

  const content = pageContent.join("");
  const data = {
    id: v4(),
    url: "file://" + fullFilePath,
    title: metadata.title || filename,
    docAuthor:
      metadata.docAuthor ||
      docs[0]?.metadata?.pdf?.info?.Creator ||
      "no author found",
    description:
      metadata.description ||
      docs[0]?.metadata?.pdf?.info?.Title ||
      "No description found.",
    docSource: metadata.docSource || "pdf file uploaded by the user.",
    chunkSource: metadata.chunkSource || "",
    published: createdDate(fullFilePath),
    wordCount: content.split(" ").length,
    pageContent: content,
    token_count_estimate: tokenizeString(content),
  };

  const document = writeToServerDocuments({
    data,
    filename: `${slugify(filename)}-${data.id}`,
    options: { parseOnly: options.parseOnly },
  });
  if (!options.absolutePath) trashFile(fullFilePath);
  console.log(`[SUCCESS]: ${filename} converted & ready for embedding.\n`);
  return { success: true, reason: null, documents: [document] };
}

module.exports = asPdf;
