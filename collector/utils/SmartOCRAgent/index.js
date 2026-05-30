/**
 * SmartOCRAgent — mini-agent for extracting text from difficult PDF and Excel files.
 *
 * Strategy: iterates through an ordered list of extraction strategies, evaluates
 * the quality of each result, and returns the best one found.  If a strategy
 * returns text that passes the quality bar the agent stops early; otherwise it
 * continues until all fallbacks are exhausted and returns whichever attempt
 * produced the most text.
 *
 * Add new strategies by pushing entries to PDF_STRATEGIES or EXCEL_STRATEGIES.
 * Each strategy is { name, fn } where fn(filePath, ctx) → Promise<string|null>.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

// ─── quality thresholds ────────────────────────────────────────────────────────
const MIN_WORDS_GOOD = 30; // "good" result
const MIN_WORDS_ACCEPTABLE = 5; // keep as last-resort if nothing better
const MAX_GARBAGE_RATIO = 0.35; // fraction of non-printable chars that disqualifies

// ─── helpers ──────────────────────────────────────────────────────────────────
function log(tag, msg, ...rest) {
  console.log(`\x1b[35m[SmartOCRAgent:${tag}]\x1b[0m ${msg}`, ...rest);
}

/**
 * Scores extracted text: returns { words, garbageRatio, isGood, isAcceptable }
 */
function scoreText(text) {
  if (!text || typeof text !== "string") {
    return { words: 0, garbageRatio: 1, isGood: false, isAcceptable: false };
  }
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const printable = (trimmed.match(/[\x20-\x7EÀ-ɏЀ-ӿ]/g) || []).length;
  const garbageRatio = trimmed.length > 0 ? 1 - printable / trimmed.length : 1;
  const isGood = words >= MIN_WORDS_GOOD && garbageRatio <= MAX_GARBAGE_RATIO;
  const isAcceptable = words >= MIN_WORDS_ACCEPTABLE && garbageRatio <= MAX_GARBAGE_RATIO;
  return { words, garbageRatio, isGood, isAcceptable };
}

// ─── PDF strategies ───────────────────────────────────────────────────────────
const PDF_STRATEGIES = [
  // ── 1. pdfjs standard text extraction ──────────────────────────────────────
  {
    name: "pdfjs-text",
    async fn(filePath) {
      try {
        const PDFLoader = require("../../processSingleFile/convert/asPDF/PDFLoader");
        const loader = new PDFLoader(filePath, { splitPages: true });
        const docs = await loader.load();
        return docs.map((d) => d.pageContent || "").join("\n");
      } catch (e) {
        log("pdfjs-text", `failed: ${e.message}`);
        return null;
      }
    },
  },

  // ── 2. pdf-parse (alternative library) ─────────────────────────────────────
  {
    name: "pdf-parse",
    async fn(filePath) {
      try {
        const pdfParse = require("pdf-parse");
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse(buffer);
        return data.text || null;
      } catch (e) {
        log("pdf-parse", `failed: ${e.message}`);
        return null;
      }
    },
  },

  // ── 3. tesseract OCR — Russian + English (основной кейс: ~99% документов) ───
  {
    name: "tesseract-rus+eng",
    async fn(filePath, ctx) {
      try {
        const OCRLoader = require("../OCRLoader");
        const loader = new OCRLoader({ targetLanguages: "rus,eng" });
        const docs = await loader.ocrPDF(filePath, {
          maxExecutionTime: ctx.timeout,
          batchSize: 5,
        });
        return docs.map((d) => d.pageContent || "").join("\n");
      } catch (e) {
        log("tesseract-rus+eng", `failed: ${e.message}`);
        return null;
      }
    },
  },

  // ── 4. tesseract OCR — English only (редкий случай чисто английских сканов) ──
  {
    name: "tesseract-eng",
    async fn(filePath, ctx) {
      try {
        const OCRLoader = require("../OCRLoader");
        const loader = new OCRLoader({ targetLanguages: "eng" });
        const docs = await loader.ocrPDF(filePath, {
          maxExecutionTime: ctx.timeout,
          batchSize: 5,
        });
        return docs.map((d) => d.pageContent || "").join("\n");
      } catch (e) {
        log("tesseract-eng", `failed: ${e.message}`);
        return null;
      }
    },
  },

  // ── 5. tesseract OCR — user-supplied languages from env ────────────────────
  {
    name: "tesseract-env-langs",
    async fn(filePath, ctx) {
      const langs = process.env.OCR_LANGUAGES || "rus,eng";
      if (langs === "rus,eng" || langs === "eng") return null; // уже пробовали выше
      try {
        const OCRLoader = require("../OCRLoader");
        const loader = new OCRLoader({ targetLanguages: langs });
        const docs = await loader.ocrPDF(filePath, {
          maxExecutionTime: ctx.timeout,
          batchSize: 5,
        });
        return docs.map((d) => d.pageContent || "").join("\n");
      } catch (e) {
        log("tesseract-env-langs", `failed: ${e.message}`);
        return null;
      }
    },
  },

  // ── 6. tesseract TESSERACT_ONLY OEM (legacy mode, helps some scans) ─────────
  {
    name: "tesseract-legacy-oem",
    async fn(filePath, ctx) {
      try {
        const { createWorker, OEM } = require("tesseract.js");
        const pdfjs = await import("pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js");
        const buffer = fs.readFileSync(filePath);
        const pdfDoc = await pdfjs.getDocument({ data: buffer });
        const sharp = (await import("sharp")).default;
        const cacheDir = path.resolve(
          process.env.STORAGE_DIR
            ? path.resolve(process.env.STORAGE_DIR, "models", "tesseract")
            : path.resolve(__dirname, "../../../server/storage/models/tesseract")
        );
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

        const worker = await createWorker(["rus", "eng"], OEM.TESSERACT_ONLY, { cachePath: cacheDir });
        const pages = [];
        for (let i = 1; i <= Math.min(pdfDoc.numPages, 20); i++) {
          const page = await pdfDoc.getPage(i);
          const ops = await page.getOperatorList();
          for (let j = 0; j < ops.fnArray.length; j++) {
            if (
              ![pdfjs.OPS.paintJpegXObject, pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject].includes(
                ops.fnArray[j]
              )
            )
              continue;
            try {
              const img = await page.objs.get(ops.argsArray[j][0]);
              const { width, height } = img;
              const channels = img.data.length / width / height;
              const buf = await sharp(img.data, { raw: { width, height, channels } })
                .greyscale()
                .normalize()
                .png()
                .toBuffer();
              const { data } = await worker.recognize(buf, {}, "text");
              pages.push(data.text);
              break;
            } catch (_) {
              /* try next image op */
            }
          }
        }
        await worker.terminate();
        return pages.join("\n") || null;
      } catch (e) {
        log("tesseract-legacy-oem", `failed: ${e.message}`);
        return null;
      }
    },
  },

  // ── 7. high-DPI re-render + tesseract ────────────────────────────────────────
  {
    name: "high-dpi-ocr",
    async fn(filePath, ctx) {
      try {
        const { createWorker, OEM } = require("tesseract.js");
        const pdfjs = await import("pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js");
        const buffer = fs.readFileSync(filePath);
        const pdfDoc = await pdfjs.getDocument({ data: buffer });
        const sharp = (await import("sharp")).default;
        const cacheDir = path.resolve(
          process.env.STORAGE_DIR
            ? path.resolve(process.env.STORAGE_DIR, "models", "tesseract")
            : path.resolve(__dirname, "../../../server/storage/models/tesseract")
        );
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

        const worker = await createWorker(["rus", "eng"], OEM.LSTM_ONLY, { cachePath: cacheDir });
        const pages = [];
        for (let i = 1; i <= Math.min(pdfDoc.numPages, 10); i++) {
          const page = await pdfDoc.getPage(i);
          const ops = await page.getOperatorList();
          for (let j = 0; j < ops.fnArray.length; j++) {
            if (
              ![pdfjs.OPS.paintJpegXObject, pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject].includes(
                ops.fnArray[j]
              )
            )
              continue;
            try {
              const img = await page.objs.get(ops.argsArray[j][0]);
              const { width, height } = img;
              const channels = img.data.length / width / height;
              const HIGH_DPI = 150;
              const buf = await sharp(img.data, { raw: { width, height, channels } })
                .resize({
                  width: Math.floor(width * (HIGH_DPI / 72)),
                  height: Math.floor(height * (HIGH_DPI / 72)),
                  fit: "fill",
                })
                .sharpen()
                .normalize()
                .png()
                .toBuffer();
              const { data } = await worker.recognize(buf, {}, "text");
              pages.push(data.text);
              break;
            } catch (_) {
              /* skip */
            }
          }
        }
        await worker.terminate();
        return pages.join("\n") || null;
      } catch (e) {
        log("high-dpi-ocr", `failed: ${e.message}`);
        return null;
      }
    },
  },

  // ── 8. pdfjs raw text (no splitPages, joined) ────────────────────────────────
  {
    name: "pdfjs-joined",
    async fn(filePath) {
      try {
        const PDFLoader = require("../../processSingleFile/convert/asPDF/PDFLoader");
        const loader = new PDFLoader(filePath, { splitPages: false });
        const docs = await loader.load();
        return docs.map((d) => d.pageContent || "").join(" ");
      } catch (e) {
        log("pdfjs-joined", `failed: ${e.message}`);
        return null;
      }
    },
  },

  // ── 9. PLACEHOLDER: Yandex Vision OCR API ────────────────────────────────────
  // Uncomment and fill in when YANDEX_VISION_API_KEY is available.
  // {
  //   name: "yandex-vision",
  //   async fn(filePath, ctx) {
  //     // TODO: implement Yandex Vision API call
  //     // POST https://vision.api.cloud.yandex.net/vision/v1/batchAnalyze
  //     // Auth: Authorization: Api-Key <YANDEX_VISION_API_KEY>
  //     // Body: { folderId, analyzeSpecs: [{ content: base64, features: [{type:"TEXT_DETECTION"}] }] }
  //     return null;
  //   },
  // },

  // ── 10. PLACEHOLDER: Google Vision OCR API ───────────────────────────────────
  // {
  //   name: "google-vision",
  //   async fn(filePath, ctx) {
  //     // TODO: implement Google Vision Document Text Detection
  //     // Requires: GOOGLE_VISION_API_KEY env var
  //     return null;
  //   },
  // },

  // ── 11. PLACEHOLDER: OpenAI / GPT-4V page-by-page vision ────────────────────
  // {
  //   name: "gpt4v-vision",
  //   async fn(filePath, ctx) {
  //     // TODO: render each PDF page as PNG, send to GPT-4V with prompt
  //     // "Extract all text from this document page verbatim."
  //     // Requires: OPENAI_API_KEY env var
  //     return null;
  //   },
  // },

  // ── 12. PLACEHOLDER: LibreOffice headless PDF-to-text ───────────────────────
  // {
  //   name: "libreoffice-export",
  //   async fn(filePath, ctx) {
  //     // TODO: shell out to `libreoffice --headless --convert-to txt <filePath>`
  //     // then read the resulting .txt file
  //     return null;
  //   },
  // },
];

// ─── Excel strategies ─────────────────────────────────────────────────────────
const EXCEL_STRATEGIES = [
  // ── 1. node-xlsx (current default) ───────────────────────────────────────────
  {
    name: "node-xlsx",
    async fn(filePath) {
      try {
        const xlsx = require("node-xlsx").default;
        const sheets = xlsx.parse(filePath);
        const parts = sheets.map((s) => {
          const rows = (s.data || [])
            .map((row) => (row || []).map((c) => (c == null ? "" : String(c))).join("\t"))
            .join("\n");
          return `[Sheet: ${s.name}]\n${rows}`;
        });
        return parts.join("\n\n") || null;
      } catch (e) {
        log("node-xlsx", `failed: ${e.message}`);
        return null;
      }
    },
  },

  // ── 2. exceljs ────────────────────────────────────────────────────────────────
  {
    name: "exceljs",
    async fn(filePath) {
      try {
        const ExcelJS = require("exceljs");
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(filePath);
        const parts = [];
        wb.eachSheet((sheet) => {
          const rows = [];
          sheet.eachRow((row) => {
            const cells = [];
            row.eachCell({ includeEmpty: true }, (cell) => {
              cells.push(cell.text != null ? String(cell.text) : "");
            });
            rows.push(cells.join("\t"));
          });
          parts.push(`[Sheet: ${sheet.name}]\n${rows.join("\n")}`);
        });
        return parts.join("\n\n") || null;
      } catch (e) {
        log("exceljs", `failed: ${e.message}`);
        return null;
      }
    },
  },

  // ── 3. exceljs CSV export mode ───────────────────────────────────────────────
  {
    name: "exceljs-csv",
    async fn(filePath) {
      try {
        const ExcelJS = require("exceljs");
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(filePath);
        const tmpDir = os.tmpdir();
        const parts = [];
        for (const sheet of wb.worksheets) {
          const tmpFile = path.join(tmpDir, `smart-ocr-${Date.now()}-${sheet.id}.csv`);
          const csvStream = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: tmpFile });
          // Serialize to CSV manually (exceljs csv write can be flakey on some files)
          const rows = [];
          sheet.eachRow((row) => {
            const cells = [];
            row.eachCell({ includeEmpty: true }, (c) => cells.push(String(c.text ?? "")));
            rows.push(cells.join(","));
          });
          parts.push(`[Sheet: ${sheet.name}]\n${rows.join("\n")}`);
          if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        }
        return parts.join("\n\n") || null;
      } catch (e) {
        log("exceljs-csv", `failed: ${e.message}`);
        return null;
      }
    },
  },

  // ── 4. node-xlsx with defval for null cells ───────────────────────────────────
  {
    name: "node-xlsx-defval",
    async fn(filePath) {
      try {
        const xlsx = require("node-xlsx").default;
        const sheets = xlsx.parse(filePath, { defval: "" });
        const parts = sheets.map((s) => {
          const rows = (s.data || [])
            .map((row) => (row || []).map((c) => String(c)).join("\t"))
            .join("\n");
          return `[Sheet: ${s.name}]\n${rows}`;
        });
        return parts.join("\n\n") || null;
      } catch (e) {
        log("node-xlsx-defval", `failed: ${e.message}`);
        return null;
      }
    },
  },

  // ── 5. PLACEHOLDER: LibreOffice headless XLSX→CSV ────────────────────────────
  // {
  //   name: "libreoffice-csv",
  //   async fn(filePath, ctx) {
  //     // TODO: shell out: `libreoffice --headless --convert-to csv <filePath>`
  //     // then read each resulting .csv file
  //     return null;
  //   },
  // },

  // ── 6. PLACEHOLDER: Python xlrd bridge (for old .xls files) ─────────────────
  // {
  //   name: "python-xlrd",
  //   async fn(filePath, ctx) {
  //     // TODO: spawn `python3 -c "import xlrd; ..."` subprocess
  //     // Useful for legacy .xls (Excel 97-2003) files that node-xlsx chokes on
  //     return null;
  //   },
  // },

  // ── 7. PLACEHOLDER: Google Sheets import API ─────────────────────────────────
  // {
  //   name: "google-sheets-import",
  //   async fn(filePath, ctx) {
  //     // TODO: upload file to Google Drive, convert to Sheets, export as CSV
  //     // Requires: GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY env var
  //     return null;
  //   },
  // },
];

// ─── SmartOCRAgent class ──────────────────────────────────────────────────────

class SmartOCRAgent {
  /**
   * @param {Object} opts
   * @param {number}  opts.timeout           - Per-strategy timeout in ms (default 120 000)
   * @param {boolean} opts.stopOnFirstGood   - Stop as soon as a "good" result is found (default true)
   * @param {boolean} opts.verbose           - Extra logging (default false)
   */
  constructor({ timeout = 120_000, stopOnFirstGood = true, verbose = false } = {}) {
    this.timeout = timeout;
    this.stopOnFirstGood = stopOnFirstGood;
    this.verbose = verbose;
  }

  _log(msg, ...args) {
    if (this.verbose) log("agent", msg, ...args);
    else console.log(`\x1b[35m[SmartOCRAgent]\x1b[0m ${msg}`, ...args);
  }

  /**
   * Runs a single strategy with a timeout guard.
   * @returns {Promise<string|null>}
   */
  async _runStrategy(strategy, filePath) {
    const ctx = { timeout: this.timeout };
    const guard = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${this.timeout}ms`)), this.timeout)
    );
    try {
      return await Promise.race([strategy.fn(filePath, ctx), guard]);
    } catch (e) {
      this._log(`Strategy "${strategy.name}" threw: ${e.message}`);
      return null;
    }
  }

  /**
   * Extract text from a PDF using the ordered fallback chain.
   * @param {string} filePath
   * @returns {Promise<{ text: string, strategyUsed: string, score: object }|null>}
   */
  async processPDF(filePath) {
    return this._runStrategies(PDF_STRATEGIES, filePath, "PDF");
  }

  /**
   * Extract text from an Excel/XLSX file using the ordered fallback chain.
   * @param {string} filePath
   * @returns {Promise<{ text: string, strategyUsed: string, score: object }|null>}
   */
  async processExcel(filePath) {
    return this._runStrategies(EXCEL_STRATEGIES, filePath, "Excel");
  }

  /**
   * Auto-detect file type and run the appropriate strategy chain.
   * @param {string} filePath
   * @returns {Promise<{ text: string, strategyUsed: string, score: object }|null>}
   */
  async process(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".pdf") return this.processPDF(filePath);
    if ([".xlsx", ".xls", ".ods", ".csv"].includes(ext)) return this.processExcel(filePath);
    this._log(`Unsupported file type: ${ext}`);
    return null;
  }

  /**
   * Core loop: iterate strategies, score results, return best or first-good.
   */
  async _runStrategies(strategies, filePath, label) {
    let best = null; // { text, strategyUsed, score }

    this._log(`Starting ${label} extraction for ${path.basename(filePath)} (${strategies.length} strategies)`);

    for (const strategy of strategies) {
      this._log(`Trying strategy: ${strategy.name}`);
      const text = await this._runStrategy(strategy, filePath);

      if (!text) {
        this._log(`Strategy "${strategy.name}" returned no text, skipping`);
        continue;
      }

      const score = scoreText(text);
      this._log(`Strategy "${strategy.name}" → ${score.words} words, garbage=${(score.garbageRatio * 100).toFixed(1)}%`);

      const candidate = { text, strategyUsed: strategy.name, score };

      if (!best || score.words > best.score.words) {
        best = candidate;
      }

      if (score.isGood && this.stopOnFirstGood) {
        this._log(`Strategy "${strategy.name}" passed quality bar — stopping early`);
        break;
      }
    }

    if (!best) {
      this._log(`All strategies failed for ${path.basename(filePath)}`);
      return null;
    }

    this._log(
      `Best result from "${best.strategyUsed}": ${best.score.words} words, garbage=${(best.score.garbageRatio * 100).toFixed(1)}%`
    );
    return best;
  }
}

module.exports = { SmartOCRAgent, scoreText, PDF_STRATEGIES, EXCEL_STRATEGIES };
