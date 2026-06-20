const PREFIX = "[OfferKP-ThreadNav]";

/** Always logs thread open/switch flow (visible in prod devtools as [FRONTEND]). */
export function threadNavLog(event, meta = {}) {
  console.info(PREFIX, event, meta);
}

export function threadSlugFromPath(pathname = "") {
  return pathname.match(/\/t\/([^/?#]+)/)?.[1] ?? null;
}
