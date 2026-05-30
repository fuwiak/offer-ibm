export const USER_MEMORY_HEADER = "--- Your notes ---";
/** @deprecated legacy header from removed leads inbox */
export const LEADS_INBOX_MEMORY_HEADER = "--- Leads inbox (last 5) ---";

export function extractUserMemoryNotes(fullMemory = "") {
  const text = String(fullMemory || "");
  const idx = text.indexOf(USER_MEMORY_HEADER);
  if (idx === -1) {
    if (text.includes(LEADS_INBOX_MEMORY_HEADER)) return "";
    return text.trim();
  }
  return text.slice(idx + USER_MEMORY_HEADER.length).trim();
}
