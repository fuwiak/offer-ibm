"use strict";

/**
 * Heuristics for PDF text layer quality (server copy — sync with collector pdfTextQuality.js).
 */

function shouldOcrInsteadOfPdfText(text, pageCount) {
  const s = text || "";
  const pages = Math.max(1, Number(pageCount) || 1);
  const trimmed = s.trim();

  if (!trimmed) return true;

  const nonSpace = s.replace(/\s/g, "").length;
  if (nonSpace < 1) return true;

  const letters = (s.match(/\p{L}/gu) || []).length;
  const digits = (s.match(/\p{N}/gu) || []).length;
  const alnumRatio = (letters + digits) / nonSpace;

  if (alnumRatio < 0.46) return true;

  const charsPerPage = nonSpace / pages;
  if (charsPerPage < 20) return true;

  return false;
}

function textQualityReport(text, pageCount) {
  const s = text || "";
  const pages = Math.max(1, Number(pageCount) || 1);
  const nonSpace = s.replace(/\s/g, "").length;
  const letters = (s.match(/\p{L}/gu) || []).length;
  const digits = (s.match(/\p{N}/gu) || []).length;
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
