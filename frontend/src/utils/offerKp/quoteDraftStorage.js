import { safeJsonParse } from "@/utils/request";
import { INITIAL_QUOTE_DRAFT } from "@/utils/offerKp/quoteFlow";

const PREFIX = "offerKp:quote-draft:";

function storageKey(workspaceSlug, threadSlug) {
  return `${PREFIX}${workspaceSlug}:${threadSlug || "default"}`;
}

function hasEditableLines(draft) {
  return (
    (draft?.hardwareLines?.length ?? 0) > 0 ||
    (draft?.preview?.lines?.length ?? 0) > 0
  );
}

export function loadQuoteDraft(workspaceSlug, threadSlug) {
  if (!workspaceSlug) return { ...INITIAL_QUOTE_DRAFT };
  const stored = safeJsonParse(
    localStorage.getItem(storageKey(workspaceSlug, threadSlug)),
    null
  );
  if (!stored || !hasEditableLines(stored)) return { ...INITIAL_QUOTE_DRAFT };
  return { ...INITIAL_QUOTE_DRAFT, ...stored };
}

export function saveQuoteDraft(workspaceSlug, threadSlug, draft) {
  if (!workspaceSlug || !hasEditableLines(draft)) return;
  localStorage.setItem(
    storageKey(workspaceSlug, threadSlug),
    JSON.stringify({
      reference: draft.reference,
      customer: draft.customer,
      hardwareLines: draft.hardwareLines,
      preview: draft.preview,
      shipping: draft.shipping,
      sourceFilename: draft.sourceFilename,
      updatedAt: Date.now(),
    })
  );
}
