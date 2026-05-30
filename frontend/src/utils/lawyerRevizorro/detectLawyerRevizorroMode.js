const PUBLIC_SLUG =
  import.meta.env.VITE_LAWYER_REVIZORRO_PUBLIC_WORKSPACE || "lawyerRevizorro-public";

export function isLawyerRevizorroWorkspace(slug) {
  if (!slug) return false;
  return slug === PUBLIC_SLUG || slug.startsWith("lawyerRevizorro");
}

const LAWYER_REVIZORRO_APP_PREFIXES = [
  "/notifications",
  "/dashboard",
  "/account",
  "/chat",
];

export function isLawyerRevizorroRoute(pathname = window.location.pathname) {
  if (pathname === "/" || pathname === "/bot" || pathname.startsWith("/bot/")) {
    return true;
  }
  return LAWYER_REVIZORRO_APP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function shouldUseLawyerRevizorroLayout({ workspaceSlug, pathname } = {}) {
  if (isLawyerRevizorroRoute(pathname)) return true;
  if (pathname?.startsWith("/workspace/")) return true;
  return isLawyerRevizorroWorkspace(workspaceSlug);
}

/** lawyer-revizorro uses profile onboarding in-app, not the legacy AnythingLLM wizard. */
export function shouldSkipLegacyOnboarding() {
  const flag = import.meta.env.VITE_LAWYER_REVIZORRO_SKIP_ONBOARDING;
  if (flag === "false") return false;
  return true;
}

export { PUBLIC_SLUG };
