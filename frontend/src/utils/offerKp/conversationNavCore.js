/** Pure navigation helpers (no side effects, safe for unit tests). */

export function threadHistoryKey(slug, threadSlug = null) {
  return `${slug ?? ""}:${threadSlug ?? "default"}`;
}

/** Replay home draft only when navigating from Home submit with explicit state. */
export function shouldReplayDraft({ locationState = null } = {}) {
  if (!locationState?.newConversation) return false;
  const draft = locationState?.draft;
  return !!draft?.message?.trim();
}

export function threadPath(workspaceSlug, threadSlug) {
  return `/workspace/${workspaceSlug}/t/${threadSlug}`;
}

export function buildDraftNavigateState(draft = {}) {
  return {
    newConversation: true,
    draft: {
      message: draft.message ?? "",
      attachments: draft.attachments ?? [],
    },
  };
}
