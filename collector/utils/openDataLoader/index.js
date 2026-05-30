"use strict";

/**
 * Optional integration with `@opendataloader/pdf`.
 *
 * OpenDataLoader is a high-quality PDF parser (correct reading order, tables)
 * that produces clean text/Markdown — great for digital PDFs. It is OPTIONAL:
 * it requires Java 11+ and the `@opendataloader/pdf` npm package to be present.
 * When either is missing this helper degrades gracefully to `null` so the
 * caller falls back to the tesseract OCR pipeline.
 *
 * Disable explicitly with OPENDATALOADER_DISABLED=true.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

let _moduleProbe = undefined; // undefined = not probed, null = unavailable

function log(text, ...args) {
  console.log(`\x1b[36m[OpenDataLoader]\x1b[0m ${text}`, ...args);
}

/** Lazily resolve the optional dependency once. */
function getModule() {
  if (_moduleProbe !== undefined) return _moduleProbe;
  if (process.env.OPENDATALOADER_DISABLED === "true") {
    _moduleProbe = null;
    return null;
  }
  try {
    const mod = require("@opendataloader/pdf");
    _moduleProbe = typeof mod?.convert === "function" ? mod : null;
  } catch (_) {
    _moduleProbe = null; // package not installed — that's fine
  }
  if (!_moduleProbe) log("not available — skipping (will use OCR fallback).");
  return _moduleProbe;
}

/**
 * Extracts plain text from a PDF using opendataloader-pdf, or returns null
 * when the parser is unavailable or produced nothing usable.
 *
 * @param {string} pdfPath
 * @returns {Promise<string|null>}
 */
async function extractWithOpenDataLoader(pdfPath) {
  const mod = getModule();
  if (!mod) return null;
  if (!pdfPath || !fs.existsSync(pdfPath)) return null;

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "odl-"));
  try {
    await mod.convert([pdfPath], { outputDir: outDir, format: "text" });

    // Collect any text-ish output the parser produced.
    const files = fs
      .readdirSync(outDir)
      .filter((f) => /\.(txt|md|markdown)$/i.test(f));
    if (files.length === 0) return null;

    const content = files
      .map((f) => {
        try {
          return fs.readFileSync(path.join(outDir, f), "utf8");
        } catch (_) {
          return "";
        }
      })
      .join("\n")
      .trim();

    return content.length > 0 ? content : null;
  } catch (e) {
    log(`conversion failed: ${e.message}`);
    return null;
  } finally {
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
  }
}

module.exports = { extractWithOpenDataLoader };
