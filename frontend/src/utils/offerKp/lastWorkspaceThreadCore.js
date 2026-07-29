import { safeJsonParse } from "@/utils/request";

/** Per-workspace last opened thread slug. */
export const LAST_THREAD_BY_WORKSPACE = "offerKp_last_thread_by_workspace";

/**
 * @param {string} workspaceSlug
 * @param {string} threadSlug
 */
export function rememberWorkspaceThread(workspaceSlug, threadSlug) {
  if (!workspaceSlug || !threadSlug) return;
  const map =
    safeJsonParse(localStorage.getItem(LAST_THREAD_BY_WORKSPACE)) || {};
  map[workspaceSlug] = { threadSlug, at: Date.now() };
  localStorage.setItem(LAST_THREAD_BY_WORKSPACE, JSON.stringify(map));
}

/**
 * @param {string} workspaceSlug
 * @returns {string|null}
 */
export function getRememberedThreadSlug(workspaceSlug) {
  if (!workspaceSlug) return null;
  const map =
    safeJsonParse(localStorage.getItem(LAST_THREAD_BY_WORKSPACE)) || {};
  const entry = map[workspaceSlug];
  return entry?.threadSlug || null;
}

/**
 * @param {string} workspaceSlug
 * @returns {number}
 */
export function getRememberedThreadAt(workspaceSlug) {
  if (!workspaceSlug) return 0;
  const map =
    safeJsonParse(localStorage.getItem(LAST_THREAD_BY_WORKSPACE)) || {};
  const entry = map[workspaceSlug];
  const at = Number(entry?.at);
  return Number.isFinite(at) ? at : 0;
}

/**
 * Newest thread by activity (lastUpdatedAt) then creation time.
 * @param {object[]} list
 * @returns {object|null}
 */
export function pickNewestThread(list = []) {
  if (!Array.isArray(list) || !list.length) return null;
  const sorted = [...list].sort((a, b) => {
    const aTime = Math.max(
      new Date(a.lastUpdatedAt || 0).getTime(),
      new Date(a.createdAt || 0).getTime()
    );
    const bTime = Math.max(
      new Date(b.lastUpdatedAt || 0).getTime(),
      new Date(b.createdAt || 0).getTime()
    );
    return bTime - aTime;
  });
  return sorted[0] || null;
}

/**
 * Pure resolve: remembered vs newest, with Home-submit race guard.
 * @param {object[]} list
 * @param {string|null} remembered
 * @param {number} rememberedAt
 * @returns {string|null}
 */
export function resolveThreadSlugFromList(
  list = [],
  remembered = null,
  rememberedAt = 0
) {
  if (!Array.isArray(list) || !list.length) return null;
  const newest = pickNewestThread(list);
  if (remembered && list.some((t) => t.slug === remembered)) {
    const newestCreated = new Date(
      newest?.createdAt || newest?.lastUpdatedAt || 0
    ).getTime();
    if (
      newest?.slug &&
      newest.slug !== remembered &&
      newestCreated > rememberedAt
    ) {
      return newest.slug;
    }
    return remembered;
  }
  return newest?.slug || null;
}
