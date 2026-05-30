import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { FullScreenLoader } from "../Preloader";
import validateSessionTokenForUser from "@/utils/session";
import paths from "@/utils/paths";
import { shouldSkipLegacyOnboarding } from "@/utils/lawyerRevizorro/detectLawyerRevizorroMode";
import { AUTH_TIMESTAMP, AUTH_TOKEN, AUTH_USER } from "@/utils/constants";
import { userFromStorage } from "@/utils/request";
import System from "@/models/system";
import UserMenu from "../UserMenu";
import { KeyboardShortcutWrapper } from "@/utils/keyboardShortcuts";

// Used only for Multi-user mode only as we permission specific pages based on auth role.
// When in single user mode we just bypass any authchecks.
function useIsAuthenticated() {
  const [isAuthd, setIsAuthed] = useState(null);
  const [shouldRedirectToOnboarding, setShouldRedirectToOnboarding] =
    useState(false);
  const [multiUserMode, setMultiUserMode] = useState(false);

  useEffect(() => {
    const validateSession = async () => {
      const onboardingComplete = await System.isOnboardingComplete();
      const systemKeys = await System.keys();
      const { MultiUserMode, RequiresAuth, HasUsers } = systemKeys ?? {};
      setMultiUserMode(MultiUserMode);

      // Legacy onboarding wizard redirect (skipped for lawyer-revizorro via shouldSkipLegacyOnboarding)
      if (onboardingComplete === false) {
        setShouldRedirectToOnboarding(true);
        if (!shouldSkipLegacyOnboarding()) {
          setIsAuthed(true);
          return;
        }
        // lawyer-revizorro: redirect to first-run setup, do not grant free access
        setIsAuthed(false);
        return;
      }

      // Single User mode without password - no auth required.
      // lawyer-revizorro: if no users exist yet, force first-run admin setup.
      if (!MultiUserMode && !RequiresAuth) {
        if (shouldSkipLegacyOnboarding() && !HasUsers) {
          setShouldRedirectToOnboarding(true);
          setIsAuthed(false);
          return;
        }
        setIsAuthed(true);
        return;
      }

      // Single User password mode check
      if (!MultiUserMode && RequiresAuth) {
        const localAuthToken = localStorage.getItem(AUTH_TOKEN);
        if (!localAuthToken) {
          setIsAuthed(false);
          return;
        }

        const isValid = await validateSessionTokenForUser();
        setIsAuthed(isValid);
        return;
      }

      // Multi-user mode checks
      const localUser = localStorage.getItem(AUTH_USER);
      const localAuthToken = localStorage.getItem(AUTH_TOKEN);
      if (!localUser || !localAuthToken) {
        setIsAuthed(false);
        return;
      }

      const isValid = await validateSessionTokenForUser();
      if (!isValid) {
        localStorage.removeItem(AUTH_USER);
        localStorage.removeItem(AUTH_TOKEN);
        localStorage.removeItem(AUTH_TIMESTAMP);
        setIsAuthed(false);
        return;
      }

      setIsAuthed(true);
    };
    validateSession();
  }, []);

  return { isAuthd, shouldRedirectToOnboarding, multiUserMode };
}

function isNativeAnythingUiPath(pathname = "") {
  if (!pathname.startsWith("/settings")) return false;
  // Allow admin/user management pages alongside user-workspaces
  const allowedPrefixes = [
    "/settings/user-workspaces",
    "/settings/users",
    "/settings/invites",
    "/settings/security",
  ];
  return !allowedPrefixes.some((prefix) => pathname.startsWith(prefix));
}

// Allows admin and manager (user workspaces, shared management UI).
export function AdminOrManagerRoute({ Component, hideUserMenu = false }) {
  const { isAuthd, shouldRedirectToOnboarding } = useIsAuthenticated();
  const { pathname } = useLocation();
  if (isAuthd === null) return <FullScreenLoader />;

  if (shouldRedirectToOnboarding) {
    return !shouldSkipLegacyOnboarding()
      ? <Navigate to={paths.onboarding.home()} />
      : <Navigate to={paths.firstRun()} />;
  }
  if (isNativeAnythingUiPath(pathname)) {
    return <Navigate to={paths.settings.userWorkspaces()} replace />;
  }

  const user = userFromStorage();
  const allowed = user?.role === "admin" || user?.role === "manager";
  return isAuthd && allowed ? (
    hideUserMenu ? (
      <KeyboardShortcutWrapper>
        <Component />
      </KeyboardShortcutWrapper>
    ) : (
      <KeyboardShortcutWrapper>
        <UserMenu>
          <Component />
        </UserMenu>
      </KeyboardShortcutWrapper>
    )
  ) : (
    <Navigate to={paths.home()} />
  );
}

// Allows only admin to access the route.
export function AdminRoute({ Component, hideUserMenu = false }) {
  const { isAuthd, shouldRedirectToOnboarding } = useIsAuthenticated();
  const { pathname } = useLocation();
  if (isAuthd === null) return <FullScreenLoader />;

  if (shouldRedirectToOnboarding) {
    return !shouldSkipLegacyOnboarding()
      ? <Navigate to={paths.onboarding.home()} />
      : <Navigate to={paths.firstRun()} />;
  }
  if (isNativeAnythingUiPath(pathname)) {
    return <Navigate to={paths.settings.userWorkspaces()} replace />;
  }

  const user = userFromStorage();
  return isAuthd && user?.role === "admin" ? (
    hideUserMenu ? (
      <KeyboardShortcutWrapper>
        <Component />
      </KeyboardShortcutWrapper>
    ) : (
      <KeyboardShortcutWrapper>
        <UserMenu>
          <Component />
        </UserMenu>
      </KeyboardShortcutWrapper>
    )
  ) : (
    <Navigate to={paths.home()} />
  );
}

// lawyer-revizorro hardening: allow only admin to access manager-gated routes.
export function ManagerRoute({ Component }) {
  const { isAuthd, shouldRedirectToOnboarding } = useIsAuthenticated();
  const { pathname } = useLocation();
  if (isAuthd === null) return <FullScreenLoader />;

  if (shouldRedirectToOnboarding) {
    return !shouldSkipLegacyOnboarding()
      ? <Navigate to={paths.onboarding.home()} />
      : <Navigate to={paths.firstRun()} />;
  }
  if (isNativeAnythingUiPath(pathname)) {
    return <Navigate to={paths.settings.userWorkspaces()} replace />;
  }

  const user = userFromStorage();
  return isAuthd && user?.role === "admin" ? (
    <KeyboardShortcutWrapper>
      <UserMenu>
        <Component />
      </UserMenu>
    </KeyboardShortcutWrapper>
  ) : (
    <Navigate to={paths.home()} />
  );
}

// Allows access only in single user mode — redirects to home in multi-user mode
export function SingleUserRoute({ Component }) {
  const { isAuthd, shouldRedirectToOnboarding, multiUserMode } =
    useIsAuthenticated();
  const { pathname } = useLocation();
  if (isAuthd === null) return <FullScreenLoader />;

  if (shouldRedirectToOnboarding) {
    return !shouldSkipLegacyOnboarding()
      ? <Navigate to={paths.onboarding.home()} />
      : <Navigate to={paths.firstRun()} />;
  }
  if (isNativeAnythingUiPath(pathname)) {
    return <Navigate to={paths.lawyerRevizorro.home()} replace />;
  }

  return isAuthd && !multiUserMode ? (
    <KeyboardShortcutWrapper>
      <Component />
    </KeyboardShortcutWrapper>
  ) : (
    <Navigate to={paths.home()} />
  );
}

export default function PrivateRoute({ Component }) {
  const { isAuthd, shouldRedirectToOnboarding } = useIsAuthenticated();
  const { pathname } = useLocation();
  if (isAuthd === null) return <FullScreenLoader />;

  if (shouldRedirectToOnboarding) {
    return !shouldSkipLegacyOnboarding()
      ? <Navigate to={paths.onboarding.home()} />
      : <Navigate to={paths.firstRun()} />;
  }
  if (isNativeAnythingUiPath(pathname)) {
    return <Navigate to={paths.lawyerRevizorro.home()} replace />;
  }

  return isAuthd ? (
    <KeyboardShortcutWrapper>
      <UserMenu>
        <Component />
      </UserMenu>
    </KeyboardShortcutWrapper>
  ) : (
    <Navigate to={paths.login(true)} />
  );
}
