/**
 * Resolve a label for composer attachment chips.
 * Hydrated thread parsed-files set `file: null` and keep metadata on `document`.
 *
 * @param {{ file?: { name?: string }|null, document?: { title?: string, filename?: string, name?: string }|null }|null} attachment
 * @returns {string}
 */
export function attachmentDisplayName(attachment = null) {
  if (!attachment || typeof attachment !== "object") return "file";
  const fromFile = String(attachment.file?.name || "").trim();
  if (fromFile) return fromFile;
  const doc = attachment.document;
  const fromDoc = String(
    doc?.title || doc?.filename || doc?.name || ""
  ).trim();
  return fromDoc || "file";
}

export default attachmentDisplayName;
