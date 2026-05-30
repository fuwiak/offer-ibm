const PUBLIC_SLUG =
  import.meta.env.VITE_OFFER_KP_PUBLIC_WORKSPACE || "offerKp-public";

export function isOfferKpWorkspace(slug) {
  if (!slug) return false;
  return slug === PUBLIC_SLUG || slug.startsWith("offerKp");
}

const OFFER_KP_APP_PREFIXES = [
  "/notifications",
  "/dashboard",
  "/account",
  "/chat",
];

export function isOfferKpRoute(pathname = window.location.pathname) {
  if (pathname === "/" || pathname === "/bot" || pathname.startsWith("/bot/")) {
    return true;
  }
  return OFFER_KP_APP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function shouldUseOfferKpLayout({ workspaceSlug, pathname } = {}) {
  if (isOfferKpRoute(pathname)) return true;
  if (pathname?.startsWith("/workspace/")) return true;
  return isOfferKpWorkspace(workspaceSlug);
}

/** offer-kp uses profile onboarding in-app, not the legacy AnythingLLM wizard. */
export function shouldSkipLegacyOnboarding() {
  const flag = import.meta.env.VITE_OFFER_KP_SKIP_ONBOARDING;
  if (flag === "false") return false;
  return true;
}

export { PUBLIC_SLUG };
