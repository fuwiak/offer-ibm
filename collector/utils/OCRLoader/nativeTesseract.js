"use strict";

/**
 * Thin wrapper around the system `tesseract` binary.
 * Used as a fallback when tesseract.js produces garbled text —
 * the native binary often handles tricky Cyrillic scans better.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

// Cached availability probe so we only shell out once per process lifetime.
let _nativeAvailable = null;

/**
 * Returns true if the system `tesseract` binary is on PATH.
 * Result is cached after the first call.
 */
async function isNativeTesseractAvailable() {
  if (_nativeAvailable !== null) return _nativeAvailable;
  try {
    await execFileAsync("tesseract", ["--version"], { timeout: 5_000 });
    _nativeAvailable = true;
  } catch (_) {
    _nativeAvailable = false;
  }
  return _nativeAvailable;
}

/**
 * Runs the native `tesseract` binary on an in-memory PNG buffer.
 *
 * @param {Buffer} pngBuffer  - Raw PNG image data
 * @param {Object} opts
 * @param {string} opts.lang  - Tesseract language spec, e.g. "rus+eng"
 * @param {string} opts.psm   - Page Segmentation Mode (default "3" = auto)
 * @param {number} opts.dpi   - Image DPI hint (default 300)
 * @returns {Promise<string>} Recognised text, or "" on error
 */
async function recognizeWithNativeTesseract(
  pngBuffer,
  { lang = "rus+eng", psm = "3", dpi = 300 } = {}
) {
  const tempBase = path.join(
    os.tmpdir(),
    `ocr-native-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const pngPath = `${tempBase}.png`;
  const outBase = `${tempBase}-out`;
  const txtPath = `${outBase}.txt`;

  try {
    fs.writeFileSync(pngPath, pngBuffer);
    await execFileAsync(
      "tesseract",
      [
        pngPath,
        outBase,
        "-l",
        lang,
        "--psm",
        String(psm),
        "--dpi",
        String(dpi),
        "-c",
        "preserve_interword_spaces=1",
      ],
      { timeout: 120_000 }
    );
    if (!fs.existsSync(txtPath)) return "";
    return fs.readFileSync(txtPath, "utf8");
  } catch (_) {
    return "";
  } finally {
    try { fs.unlinkSync(pngPath); } catch (_) { /* ignore */ }
    try { fs.unlinkSync(txtPath); } catch (_) { /* ignore */ }
  }
}

// Cached availability probe for the poppler `pdftoppm` binary.
let _pdftoppmAvailable = null;

/**
 * Returns true if the poppler `pdftoppm` binary is on PATH.
 * Result is cached after the first call.
 */
async function isPdftoppmAvailable() {
  if (_pdftoppmAvailable !== null) return _pdftoppmAvailable;
  try {
    await execFileAsync("pdftoppm", ["-v"], { timeout: 5_000 });
    _pdftoppmAvailable = true;
  } catch (e) {
    // pdftoppm prints version to stderr and may exit non-zero on some builds;
    // only a missing binary (ENOENT) means it is truly unavailable.
    _pdftoppmAvailable = e?.code !== "ENOENT";
  }
  return _pdftoppmAvailable;
}

/**
 * Renders PDF pages to full-page PNGs with poppler `pdftoppm` and OCRs each
 * one with the native `tesseract` binary.
 *
 * This is far more reliable for scanned documents than extracting embedded
 * image XObjects via pdfjs (which often yields tiny/garbled fragments such as
 * "Image too small to scale (1x36)"), because it rasterises the whole page.
 *
 * @param {string} pdfPath - Path to the source PDF
 * @param {Object} opts
 * @param {string} opts.lang        - Tesseract language spec, e.g. "rus+eng"
 * @param {number} opts.dpi         - Render DPI (default 300)
 * @param {string} opts.psm         - Page Segmentation Mode (default "3")
 * @param {number|null} opts.firstPage - 1-indexed first page to render (inclusive)
 * @param {number|null} opts.lastPage  - 1-indexed last page to render (inclusive)
 * @param {((info: {pageNumber:number, text:string}) => void)|null} opts.onPage
 * @returns {Promise<{pageNumber: number, text: string}[]>} per-page texts (sorted)
 */
async function recognizeWithPdftoppm(
  pdfPath,
  {
    lang = "rus+eng",
    dpi = 300,
    psm = "3",
    firstPage = null,
    lastPage = null,
    onPage = null,
  } = {}
) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-ppm-"));
  const outRoot = path.join(tmpDir, "page");
  try {
    const args = ["-png", "-r", String(dpi)];
    if (firstPage) args.push("-f", String(firstPage));
    if (lastPage) args.push("-l", String(lastPage));
    args.push(pdfPath, outRoot);

    await execFileAsync("pdftoppm", args, { timeout: 600_000 });

    // pdftoppm names files `<root>-<pageNumber>.png` (page number padded to the
    // width of the last page). The numeric suffix is the actual 1-indexed page.
    const pageFiles = fs
      .readdirSync(tmpDir)
      .map((f) => ({
        file: f,
        page: parseInt((f.match(/-(\d+)\.png$/) || [])[1] || "0", 10),
      }))
      .filter((x) => x.page > 0)
      .sort((a, b) => a.page - b.page);

    const results = [];
    for (const { file, page } of pageFiles) {
      const buf = fs.readFileSync(path.join(tmpDir, file));
      const text = await recognizeWithNativeTesseract(buf, { lang, psm, dpi });
      results.push({ pageNumber: page, text });
      if (typeof onPage === "function") {
        try {
          onPage({ pageNumber: page, text });
        } catch (_) {
          /* progress callbacks must never break OCR */
        }
      }
    }
    return results;
  } catch (_) {
    return [];
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
  }
}

module.exports = {
  isNativeTesseractAvailable,
  recognizeWithNativeTesseract,
  isPdftoppmAvailable,
  recognizeWithPdftoppm,
};
