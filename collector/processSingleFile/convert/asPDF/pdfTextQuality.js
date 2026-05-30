"use strict";

/**
 * Heuristics for deciding whether a PDF's digital text layer is usable
 * or whether OCR should be run instead.
 *
 * The key insight: scanned PDFs often have either no text layer at all,
 * or a garbled one full of replacement characters and symbols.  We check
 * the ratio of letters+digits vs all non-whitespace chars as a proxy for
 * "real text".
 */

/**
 * Returns true when OCR should replace the PDF text layer.
 *
 * @param {string} text      - Concatenated text from all pages
 * @param {number} pageCount - Number of pages in the PDF
 */
function shouldOcrInsteadOfPdfText(text, pageCount) {
  const s = text || "";
  const pages = Math.max(1, Number(pageCount) || 1);
  const trimmed = s.trim();

  // Completely empty
  if (!trimmed) return true;

  const nonSpace = s.replace(/\s/g, "").length;
  if (nonSpace < 1) return true;

  const letters = (s.match(/\p{L}/gu) || []).length;
  const digits  = (s.match(/\p{N}/gu) || []).length;
  const alnumRatio = (letters + digits) / nonSpace;

  // Много мусорных символов — типично для битого слоя / мусорного OCR
  if (alnumRatio < 0.46) return true;

  // Очень мало текста на страницу — скорее всего скан без слоя
  const charsPerPage = nonSpace / pages;
  if (charsPerPage < 20) return true;

  return false;
}

/**
 * Returns a debug-friendly summary of the text quality decision.
 *
 * @param {string} text
 * @param {number} pageCount
 * @returns {{ needsOcr: boolean, alnumRatio: number, charsPerPage: number }}
 */
function textQualityReport(text, pageCount) {
  const s = text || "";
  const pages = Math.max(1, Number(pageCount) || 1);
  const nonSpace = s.replace(/\s/g, "").length;
  const letters = (s.match(/\p{L}/gu) || []).length;
  const digits  = (s.match(/\p{N}/gu) || []).length;
  const alnumRatio = nonSpace > 0 ? (letters + digits) / nonSpace : 0;
  const charsPerPage = nonSpace / pages;
  return {
    needsOcr: shouldOcrInsteadOfPdfText(text, pageCount),
    alnumRatio: +alnumRatio.toFixed(3),
    charsPerPage: +charsPerPage.toFixed(1),
    nonSpaceChars: nonSpace,
    pages,
  };
}

module.exports = { shouldOcrInsteadOfPdfText, textQualityReport };
