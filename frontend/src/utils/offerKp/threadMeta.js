import { safeJsonParse } from "@/utils/request";
import { extractUserMemoryNotes } from "@/utils/offerKp/leadsInboxContext";

const STORAGE_PREFIX = "offerKp:thread-meta:";

function storageKey(workspaceSlug, threadSlug) {
  return `${STORAGE_PREFIX}${workspaceSlug}:${threadSlug}`;
}

export function getThreadMeta(workspaceSlug, threadSlug) {
  if (!workspaceSlug || !threadSlug) {
    return { memory: "", instructions: "", prompts: [] };
  }
  const stored = safeJsonParse(
    localStorage.getItem(storageKey(workspaceSlug, threadSlug)),
    null
  );
  return {
    memory: stored?.memory ?? "",
    instructions: stored?.instructions ?? "",
    prompts: Array.isArray(stored?.prompts) ? stored.prompts : [],
  };
}

/** User-written notes only (excludes auto Leads inbox block). */
export function getConversationMemoryNotes(workspaceSlug, threadSlug) {
  return extractUserMemoryNotes(
    getThreadMeta(workspaceSlug, threadSlug).memory
  );
}

export function setThreadMeta(workspaceSlug, threadSlug, partial) {
  if (!workspaceSlug || !threadSlug) return;
  const current = getThreadMeta(workspaceSlug, threadSlug);
  localStorage.setItem(
    storageKey(workspaceSlug, threadSlug),
    JSON.stringify({ ...current, ...partial, updatedAt: Date.now() })
  );
}

export function getThreadPrompts(workspaceSlug, threadSlug) {
  return getThreadMeta(workspaceSlug, threadSlug).prompts;
}

export function setThreadPrompts(workspaceSlug, threadSlug, prompts) {
  if (!workspaceSlug || !threadSlug) return;
  setThreadMeta(workspaceSlug, threadSlug, {
    prompts: (prompts || []).map((p) => String(p).trim()).filter(Boolean),
  });
}

export function addThreadPrompt(workspaceSlug, threadSlug, prompt) {
  const text = String(prompt || "").trim();
  if (!text) return getThreadPrompts(workspaceSlug, threadSlug);
  const next = [...getThreadPrompts(workspaceSlug, threadSlug), text];
  setThreadPrompts(workspaceSlug, threadSlug, next);
  return next;
}

export function removeThreadPrompt(workspaceSlug, threadSlug, index) {
  const next = getThreadPrompts(workspaceSlug, threadSlug).filter(
    (_, i) => i !== index
  );
  setThreadPrompts(workspaceSlug, threadSlug, next);
  return next;
}

export function formatRelativeTimeAgo(isoOrTs, locale = "en") {
  const then = new Date(isoOrTs).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (sec < 60) return rtf.format(-sec, "second");
  const min = Math.floor(sec / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.floor(min / 60);
  if (hr < 24) return rtf.format(-hr, "hour");
  const day = Math.floor(hr / 24);
  if (day < 30) return rtf.format(-day, "day");
  const month = Math.floor(day / 30);
  return rtf.format(-month, "month");
}
