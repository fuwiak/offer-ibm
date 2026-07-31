/**
 * Normalize text for PDF drawing.
 * Cyrillic is kept as-is — quote PDF embeds Liberation Sans (Cyrillic-capable).
 * Only strips control chars and normalizes exotic spaces that break layout.
 */
function toPdfSafeText(text) {
  return (
    String(text ?? "")
      .replace(/[\u202f\u00a0]/g, " ")
      // eslint-disable-next-line no-control-regex -- drop C0/C1 controls except tab/LF/CR
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "")
  );
}

module.exports = { toPdfSafeText };
