"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { VALID_LANGUAGE_CODES } = require("./validLangs");
const {
  isNativeTesseractAvailable,
  recognizeWithNativeTesseract,
  isPdftoppmAvailable,
  recognizeWithPdftoppm,
} = require("./nativeTesseract");

// PSM modes tried in order when native fallback is needed.
// 3 = fully automatic, 6 = single uniform block, 4 = single column.
const NATIVE_PSM_CANDIDATES = ["3", "6", "4"];

// DPI used when rendering PDF pages to images.
const RENDER_DPI = 300;

// ─── Text quality helpers ─────────────────────────────────────────────────────

/**
 * Scores the quality of recognised text.
 * Base: ratio of (letters + digits) to all non-whitespace chars.
 * Bonus: Cyrillic presence (up to +0.6) + text length (up to +0.4).
 * Maximum possible score ≈ 2.0.
 */
function textQualityScore(text = "") {
  if (!text || typeof text !== "string") return 0;
  const nonSpace = text.replace(/\s/g, "").length;
  if (nonSpace === 0) return 0;
  const letters = (text.match(/\p{L}/gu) || []).length;
  const digits  = (text.match(/\p{N}/gu) || []).length;
  const cyr     = (text.match(/[А-Яа-яЁё]/g) || []).length;
  const alnumRatio = (letters + digits) / nonSpace;
  const cyrBonus  = Math.min(1, cyr / 60) * 0.6;
  const lenBonus  = Math.min(1, text.length / 300) * 0.4;
  return alnumRatio + cyrBonus + lenBonus;
}

/**
 * Returns true when the text is likely garbage (too short or too low quality).
 * Threshold: < 45 non-whitespace chars OR quality score < 1.0.
 */
function isLikelyGarbledText(text = "") {
  const cleanLen = (text || "").replace(/\s/g, "").length;
  const score = textQualityScore(text);
  return cleanLen < 45 || score < 1.0;
}

/**
 * Picks the best candidate from an array of text strings.
 * @param {string[]} texts
 * @returns {{ text: string, score: number }}
 */
function pickBestTextVariant(texts = []) {
  let best = { text: "", score: 0 };
  for (const t of texts) {
    if (!t || typeof t !== "string") continue;
    const score = textQualityScore(t);
    if (score > best.score) best = { text: t, score };
  }
  return best;
}

// ─── OCRLoader ────────────────────────────────────────────────────────────────

class OCRLoader {
  /**
   * The language code(s) to use for the OCR.
   * @type {string[]}
   */
  language;
  /**
   * The cache directory for the OCR.
   * @type {string}
   */
  cacheDir;

  /**
   * @param {Object} options
   * @param {string} options.targetLanguages - Comma-separated language codes, e.g. "rus,eng"
   *
   * Default is "rus,eng": в этом проекте ~99% документов на русском языке,
   * изредка на английском. Русский всегда ставится первым (#prioritizeRussianFirst),
   * а текст всегда обрабатывается в кодировке UTF-8.
   */
  constructor({ targetLanguages = "rus,eng" } = {}) {
    this.language = this.parseLanguages(targetLanguages);
    this.#prioritizeRussianFirst(this.language);
    this.cacheDir = path.resolve(
      process.env.STORAGE_DIR
        ? path.resolve(process.env.STORAGE_DIR, "models", "tesseract")
        : path.resolve(__dirname, "../../../server/storage/models/tesseract")
    );
    if (!fs.existsSync(this.cacheDir))
      fs.mkdirSync(this.cacheDir, { recursive: true });
    this.log(
      "OCRLoader initialized with language support for:",
      this.language.map((lang) => VALID_LANGUAGE_CODES[lang]).join(", ")
    );
  }

  /**
   * Parses and validates a comma-separated list of language codes.
   * @param {string} language
   * @returns {string[]}
   */
  parseLanguages(language = null) {
    // Фолбэк для проекта: русский + английский (русский приоритетнее).
    const DEFAULT_LANGS = ["rus", "eng"];
    try {
      if (!language || typeof language !== "string") return [...DEFAULT_LANGS];
      const langList = language
        .split(",")
        .map((lang) => (lang.trim() !== "" ? lang.trim() : null))
        .filter(Boolean)
        .filter((lang) => VALID_LANGUAGE_CODES.hasOwnProperty(lang));
      if (langList.length === 0) return [...DEFAULT_LANGS];
      return langList;
    } catch (e) {
      this.log(`Error parsing languages: ${e.message}`, e.stack);
      return [...DEFAULT_LANGS];
    }
  }

  /** В rus+eng Tesseract должен видеть `rus` первым — иначе кириллица часто «ломается». */
  #prioritizeRussianFirst(codes) {
    codes.sort((a, b) => {
      const rank = (x) => (x === "rus" ? 0 : x === "eng" ? 1 : 2);
      const d = rank(a) - rank(b);
      return d !== 0 ? d : a.localeCompare(b);
    });
  }

  log(text, ...args) {
    console.log(`\x1b[36m[OCRLoader]\x1b[0m ${text}`, ...args);
  }

  /**
   * Loads a scanned PDF and returns an array of page documents.
   * Pipeline per page:
   *   1. tesseract.js (LSTM, enhanced image at RENDER_DPI)
   *   2. if garbled → native tesseract binary with multiple PSM modes
   *   3. pick best result by textQualityScore
   *
   * @param {string} filePath
   * @param {Object} opts
   * @param {number} opts.maxExecutionTime - Overall timeout in ms
   * @param {number} opts.batchSize        - Pages per batch
   * @param {number|null} opts.maxWorkers  - Worker pool size (default: min(cpus, 4))
   * @param {((info: {pageNumber: number, totalPages: number, pageContent: string}) => void)|null} opts.onPage
   *        - Optional callback invoked as soon as each page is recognised (for SSE streaming).
   * @returns {Promise<{pageContent: string, metadata: object}[]>}
   */
  async ocrPDF(
    filePath,
    {
      maxExecutionTime = 300_000,
      batchSize = 10,
      maxWorkers = null,
      onPage = null,
    } = {}
  ) {
    if (
      !filePath ||
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()
    ) {
      this.log(`File ${filePath} does not exist. Skipping OCR.`);
      return [];
    }

    const documentTitle = path.basename(filePath);
    this.log(`Starting OCR of ${documentTitle}`);
    const pdfjs = await import("pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js");
    const buffer = fs.readFileSync(filePath);
    const pdfDocument = await pdfjs.getDocument({ data: buffer });

    const documents = [];
    const meta = await pdfDocument.getMetadata().catch(() => null);
    const metadata = {
      source: filePath,
      pdf: {
        version: "v2.0.550",
        info: meta?.info,
        metadata: meta?.metadata,
        totalPages: pdfDocument.numPages,
      },
    };

    const pdfSharp = new PDFSharp({
      validOps: [
        pdfjs.OPS.paintJpegXObject,
        pdfjs.OPS.paintImageXObject,
        pdfjs.OPS.paintInlineImageXObject,
      ],
    });
    await pdfSharp.init();

    const langSpec = this.language.join("+");
    const nativeTesseractReady = await isNativeTesseractAvailable();
    if (nativeTesseractReady) {
      this.log("Native tesseract binary detected — will use as fallback for garbled pages.");
    }

    const { createWorker, OEM } = require("tesseract.js");
    const BATCH_SIZE = batchSize;
    const MAX_EXECUTION_TIME = maxExecutionTime;
    const NUM_WORKERS = maxWorkers ?? Math.min(os.cpus().length, 4);
    const totalPages = pdfDocument.numPages;
    const workerPool = await Promise.all(
      Array(NUM_WORKERS)
        .fill(0)
        .map(() =>
          createWorker(this.language, OEM.LSTM_ONLY, {
            cachePath: this.cacheDir,
          })
        )
    );

    const startTime = Date.now();
    try {
      this.log("Bootstrapping OCR completed successfully!", {
        MAX_EXECUTION_TIME_MS: MAX_EXECUTION_TIME,
        BATCH_SIZE,
        MAX_CONCURRENT_WORKERS: NUM_WORKERS,
        TOTAL_PAGES: totalPages,
        NATIVE_FALLBACK: nativeTesseractReady,
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `OCR job took too long to complete (${MAX_EXECUTION_TIME / 1000} seconds)`
            )
          );
        }, MAX_EXECUTION_TIME);
      });

      const processPages = async () => {
        for (
          let startPage = 1;
          startPage <= totalPages;
          startPage += BATCH_SIZE
        ) {
          const endPage = Math.min(startPage + BATCH_SIZE - 1, totalPages);
          const pageNumbers = Array.from(
            { length: endPage - startPage + 1 },
            (_, i) => startPage + i
          );
          this.log(`Working on pages ${startPage} - ${endPage}`);

          const pageQueue = [...pageNumbers];
          const results = [];

          const workerPromises = workerPool.map(async (worker, workerIndex) => {
            while (pageQueue.length > 0) {
              const pageNum = pageQueue.shift();
              this.log(
                `\x1b[34m[Worker ${workerIndex + 1}]\x1b[0m assigned pg${pageNum}`
              );

              const page = await pdfDocument.getPage(pageNum);
              const { imageBuffer, rawPng } = await pdfSharp.pageToBuffers({ page });
              if (!imageBuffer) continue;

              // ── 1. tesseract.js primary pass ──────────────────────────────
              const { data } = await worker.recognize(imageBuffer, {}, "text");
              let pageText = data.text || "";

              // ── 2. native tesseract fallback if result is garbled ─────────
              if (isLikelyGarbledText(pageText) && nativeTesseractReady && rawPng) {
                this.log(
                  `Garbled OCR on pg${pageNum} after tesseract.js; switching to native fallback.`
                );
                const nativeTexts = await Promise.all(
                  NATIVE_PSM_CANDIDATES.map((nativePsm) =>
                    recognizeWithNativeTesseract(rawPng, {
                      lang: langSpec,
                      psm: nativePsm,
                      dpi: RENDER_DPI,
                    })
                  )
                );
                const { text: nativeText, score: nativeScore } =
                  pickBestTextVariant(nativeTexts);
                if (nativeText.trim().length > 0) {
                  this.log(
                    `Using native OCR result on pg${pageNum} (score ${nativeScore.toFixed(2)})`
                  );
                  pageText = nativeText;
                }
              }

              this.log(
                `✅ \x1b[34m[Worker ${workerIndex + 1}]\x1b[0m completed pg${pageNum}`
              );
              results.push({
                pageContent: pageText,
                metadata: {
                  ...metadata,
                  loc: { pageNumber: pageNum },
                },
              });

              // Notify listeners as soon as a page is recognised (SSE streaming).
              if (typeof onPage === "function") {
                try {
                  onPage({
                    pageNumber: pageNum,
                    totalPages,
                    pageContent: pageText,
                  });
                } catch (_) {
                  /* progress callbacks must never break OCR */
                }
              }
            }
          });

          await Promise.all(workerPromises);
          documents.push(
            ...results.sort(
              (a, b) => a.metadata.loc.pageNumber - b.metadata.loc.pageNumber
            )
          );
        }
        return documents;
      };

      await Promise.race([timeoutPromise, processPages()]);
    } catch (e) {
      this.log(`Error: ${e.message}`, e.stack);
    } finally {
      global.Image = undefined;
      await Promise.all(workerPool.map((worker) => worker.terminate()));
    }

    this.log(`Completed OCR of ${documentTitle}!`, {
      documentsParsed: documents.length,
      totalPages,
      executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
    });
    return documents;
  }

  /**
   * Returns true when the native `tesseract` + `pdftoppm` binaries are both
   * available, enabling the high-reliability full-page rendering OCR path.
   * @returns {Promise<boolean>}
   */
  async nativePipelineAvailable() {
    const [tess, ppm] = await Promise.all([
      isNativeTesseractAvailable(),
      isPdftoppmAvailable(),
    ]);
    return tess && ppm;
  }

  /**
   * OCRs a PDF (or page range) by rasterising full pages with poppler
   * `pdftoppm` and recognising each with the native `tesseract` binary.
   *
   * Much more robust for scanned documents than the pdfjs image-extraction
   * path used by {@link ocrPDF}. Requires {@link nativePipelineAvailable}.
   *
   * @param {string} filePath
   * @param {Object} opts
   * @param {number|null} opts.firstPage - 1-indexed first page (inclusive)
   * @param {number|null} opts.lastPage  - 1-indexed last page (inclusive)
   * @param {number} opts.dpi
   * @param {((info:{pageNumber:number, totalPages:number}) => void)|null} opts.onPage
   * @param {number|null} opts.totalPagesHint - used only for progress reporting
   * @returns {Promise<{pageContent: string, metadata: object}[]>}
   */
  async ocrPDFNative(
    filePath,
    {
      firstPage = null,
      lastPage = null,
      dpi = 300,
      onPage = null,
      totalPagesHint = null,
    } = {}
  ) {
    if (
      !filePath ||
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()
    ) {
      this.log(`File ${filePath} does not exist. Skipping native OCR.`);
      return [];
    }

    const documentTitle = path.basename(filePath);
    const startTime = Date.now();
    this.log(`Starting native (pdftoppm) OCR of ${documentTitle}`, {
      firstPage,
      lastPage,
    });

    const lang = this.language.join("+");
    const pages = await recognizeWithPdftoppm(filePath, {
      lang,
      dpi,
      firstPage,
      lastPage,
      onPage: ({ pageNumber }) => {
        if (typeof onPage === "function")
          onPage({ pageNumber, totalPages: totalPagesHint || 0 });
      },
    });

    this.log(`Completed native OCR of ${documentTitle}!`, {
      documentsParsed: pages.length,
      executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
    });

    return pages.map((p) => ({
      pageContent: p.text,
      metadata: { source: filePath, loc: { pageNumber: p.pageNumber } },
    }));
  }

  /**
   * OCRs a single image file.
   * Falls back to native tesseract if the result is garbled.
   *
   * @param {string} filePath
   * @param {Object} opts
   * @param {number} opts.maxExecutionTime
   * @returns {Promise<string|null>}
   */
  async ocrImage(filePath, { maxExecutionTime = 300_000 } = {}) {
    let content = "";
    let worker = null;
    if (
      !filePath ||
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()
    ) {
      this.log(`File ${filePath} does not exist. Skipping OCR.`);
      return null;
    }

    const documentTitle = path.basename(filePath);
    try {
      this.log(`Starting OCR of ${documentTitle}`);
      const startTime = Date.now();
      const { createWorker, OEM } = require("tesseract.js");
      worker = await createWorker(this.language, OEM.LSTM_ONLY, {
        cachePath: this.cacheDir,
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `OCR job took too long to complete (${maxExecutionTime / 1000} seconds)`
            )
          );
        }, maxExecutionTime);
      });

      const processImage = async () => {
        const { data } = await worker.recognize(filePath, {}, "text");
        content = data.text;
      };

      await Promise.race([timeoutPromise, processImage()]);

      // Native fallback for garbled image OCR
      if (isLikelyGarbledText(content)) {
        const nativeTesseractReady = await isNativeTesseractAvailable();
        if (nativeTesseractReady) {
          this.log(`Garbled result for ${documentTitle}; trying native tesseract fallback.`);
          const imgBuffer = fs.readFileSync(filePath);
          const nativeTexts = await Promise.all(
            NATIVE_PSM_CANDIDATES.map((psm) =>
              recognizeWithNativeTesseract(imgBuffer, {
                lang: this.language.join("+"),
                psm,
                dpi: RENDER_DPI,
              })
            )
          );
          const { text: nativeText, score } = pickBestTextVariant(nativeTexts);
          if (nativeText.trim().length > 0) {
            this.log(`Using native OCR for image (score ${score.toFixed(2)})`);
            content = nativeText;
          }
        }
      }

      this.log(`Completed OCR of ${documentTitle}!`, {
        executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        qualityScore: textQualityScore(content).toFixed(2),
      });

      return content;
    } catch (e) {
      this.log(`Error: ${e.message}`);
      return null;
    } finally {
      // eslint-disable-next-line
      if (!worker) return;
      await worker.terminate();
    }
  }
}

// ─── PDFSharp ─────────────────────────────────────────────────────────────────

/**
 * Renders PDF pages to image buffers using Sharp.
 * Produces two variants per page:
 *   - rawPng       — high-DPI PNG for native tesseract binary
 *   - imageBuffer  — grayscale + normalized + sharpened PNG for tesseract.js
 */
class PDFSharp {
  constructor({ validOps = [] } = {}) {
    this.sharp = null;
    this.validOps = validOps;
  }

  log(text, ...args) {
    console.log(`\x1b[36m[PDFSharp]\x1b[0m ${text}`, ...args);
  }

  async init() {
    this.sharp = (await import("sharp")).default;
  }

  /**
   * Applies grayscale → normalize → sharpen to improve Tesseract accuracy.
   * @param {Buffer} pngBuffer
   * @returns {Promise<Buffer>}
   */
  async enhanceForOcr(pngBuffer) {
    if (!this.sharp) await this.init();
    try {
      return await this.sharp(pngBuffer)
        .grayscale()
        .normalize()
        .sharpen({ sigma: 0.5 })
        .png()
        .toBuffer();
    } catch (error) {
      this.log(`enhanceForOcr: ${error.message}`);
      return pngBuffer;
    }
  }

  /**
   * Converts a PDF page to two buffers: raw PNG and enhanced PNG.
   * Returns { imageBuffer, rawPng } — both may be null if no image was found.
   *
   * @param {Object} opts
   * @param {Object} opts.page - PDFJS page proxy
   * @returns {Promise<{ imageBuffer: Buffer|null, rawPng: Buffer|null }>}
   */
  async pageToBuffers({ page }) {
    if (!this.sharp) await this.init();
    try {
      this.log(`Converting page ${page.pageNumber} to image...`);
      const ops = await page.getOperatorList();
      const pageImages = ops.fnArray.length;

      for (let i = 0; i < pageImages; i++) {
        try {
          if (!this.validOps.includes(ops.fnArray[i])) continue;

          const name = ops.argsArray[i][0];
          const img = await page.objs.get(name);
          const { width, height } = img;
          const channels = img.data.length / width / height;
          const targetWidth  = Math.floor(width  * (RENDER_DPI / 72));
          const targetHeight = Math.floor(height * (RENDER_DPI / 72));

          const rawPng = await this.sharp(img.data, {
            raw: { width, height, channels },
            density: RENDER_DPI,
          })
            .resize({ width: targetWidth, height: targetHeight, fit: "fill" })
            .withMetadata({ density: RENDER_DPI })
            .png()
            .toBuffer();

          const imageBuffer = await this.enhanceForOcr(rawPng);
          return { imageBuffer, rawPng };
        } catch (error) {
          this.log(`Iteration error: ${error.message}`, error.stack);
          continue;
        }
      }
      this.log(`No valid images found on page ${page.pageNumber}`);
      return { imageBuffer: null, rawPng: null };
    } catch (error) {
      this.log(`Error: ${error.message}`, error.stack);
      return { imageBuffer: null, rawPng: null };
    }
  }

  /**
   * Backward-compatible single-buffer API used by SmartOCRAgent.
   * Returns the enhanced buffer (same as imageBuffer from pageToBuffers).
   * @param {Object} opts
   * @param {Object} opts.page
   * @returns {Promise<Buffer|null>}
   */
  async pageToBuffer({ page }) {
    const { imageBuffer } = await this.pageToBuffers({ page });
    return imageBuffer;
  }
}

module.exports = OCRLoader;
module.exports.textQualityScore = textQualityScore;
module.exports.isLikelyGarbledText = isLikelyGarbledText;
module.exports.pickBestTextVariant = pickBestTextVariant;
