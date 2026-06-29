export const THREAD_FOLLOW_UP_EVENT = "offerKp:thread-follow-ups";

export function dispatchThreadFollowUps({
  workspaceSlug,
  threadSlug,
  suggestions = [],
}) {
  if (!workspaceSlug || !threadSlug || !Array.isArray(suggestions)) return;
  window.dispatchEvent(
    new CustomEvent(THREAD_FOLLOW_UP_EVENT, {
      detail: { workspaceSlug, threadSlug, suggestions },
    })
  );
}
