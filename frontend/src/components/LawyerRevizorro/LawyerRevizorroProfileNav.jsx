import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  User,
  Users,
  CaretDown,
  SquaresFour,
} from "@phosphor-icons/react";
import paths from "@/utils/paths";
import useUser from "@/hooks/useUser";
import useLawyerRevizorroRole from "@/hooks/useLawyerRevizorroRole";

function isProfileSection(pathname) {
  return (
    pathname.startsWith("/account/profile") ||
    pathname.startsWith("/account/users") ||
    pathname.includes("/settings/user-workspaces")
  );
}

export default function LawyerRevizorroProfileNav() {
  const { t } = useTranslation("lawyerRevizorro");
  const { pathname } = useLocation();
  const { user } = useUser();
  const { isAdmin } = useLawyerRevizorroRole();
  const isManager = user?.role === "manager";
  const canUserWorkspaces = isAdmin || isManager;
  const showProfileGroup = canUserWorkspaces;
  const [open, setOpen] = useState(() => isProfileSection(pathname));

  useEffect(() => {
    if (isProfileSection(pathname)) setOpen(true);
  }, [pathname]);

  const profilePath = paths.lawyerRevizorro.profile();
  const usersPath = paths.lawyerRevizorro.users();
  const userWorkspacesPath = paths.settings.userWorkspaces();

  const profileActive = pathname === profilePath;
  const usersActive = pathname.startsWith("/account/users");
  const userWorkspacesActive = pathname.includes("/settings/user-workspaces");
  const groupActive = profileActive || usersActive || userWorkspacesActive;

  if (!showProfileGroup) {
    return (
      <Link
        to={profilePath}
        className={`lawyerRevizorro-nav-item ${profileActive ? "lawyerRevizorro-nav-item--active" : ""}`}
      >
        <span className="flex items-center gap-2">
          <User size={18} />
          {t("admin.profile")}
        </span>
      </Link>
    );
  }

  const subItems = [
    {
      key: "activeUser",
      icon: User,
      path: profilePath,
      label: t("account.profileNav.activeUser"),
      active: profileActive,
    },
    ...(isAdmin
      ? [
          {
            key: "users",
            icon: Users,
            path: usersPath,
            label: t("account.profileNav.users", { defaultValue: "Users" }),
            active: usersActive,
          },
        ]
      : []),
    ...(canUserWorkspaces
      ? [
          {
            key: "userWorkspaces",
            icon: SquaresFour,
            path: userWorkspacesPath,
            label: t("admin.nav.userWorkspaces", {
              defaultValue: "User Workspaces",
            }),
            active: userWorkspacesActive,
          },
        ]
      : []),
  ];

  return (
    <div className="lawyerRevizorro-nav-group">
      <button
        type="button"
        className={`lawyerRevizorro-nav-item w-full ${groupActive ? "lawyerRevizorro-nav-item--active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <User size={18} />
          {t("admin.profile")}
        </span>
        <CaretDown
          size={14}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <nav className="lawyerRevizorro-nav-sub" aria-label={t("admin.profile")}>
          {subItems.map(({ key, icon: Icon, path, label, active }) => (
            <Link
              key={key}
              to={path}
              className={`lawyerRevizorro-nav-subitem ${active ? "lawyerRevizorro-nav-subitem--active" : ""}`}
            >
              <Icon size={16} weight={active ? "fill" : "regular"} />
              {label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
