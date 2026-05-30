import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CaretDown, Check, Stack } from "@phosphor-icons/react";
import useOfferKpRole from "@/hooks/useOfferKpRole";
import { useOfferKp } from "@/contexts/OfferKpContext";
import Workspace from "@/models/workspace";
import {
  filterWorkspacesForViewer,
  getEffectiveWorkspaceProfile,
} from "@/utils/offerKp/userWorkspaceProfiles";
import { switchToWorkspace } from "@/utils/offerKp/switchWorkspace";

/**
 * Shows which workspace (space) the user is in, with optional switcher.
 */
export default function CurrentWorkspaceIndicator({
  workspace = null,
  workspaceSlug = null,
  variant = "sidebar",
  className = "",
  switchable = true,
  onWorkspaceSelect = null,
  menuPlacement = "below",
}) {
  const { t } = useTranslation("offerKp");
  const navigate = useNavigate();
  const { slug: routeSlug } = useParams();
  const { activeWorkspaceSlug } = useOfferKp();
  const { role } = useOfferKpRole();
  const slug =
    workspace?.slug ?? workspaceSlug ?? routeSlug ?? activeWorkspaceSlug;
  const [resolvedWorkspace, setResolvedWorkspace] = useState(workspace);
  const identity = getEffectiveWorkspaceProfile({
    userRole: role,
    workspace: workspace || resolvedWorkspace,
  });
  const [name, setName] = useState(workspace?.name ?? null);
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (workspace?.name) {
      setName(workspace.name);
      return;
    }
    if (!slug) {
      setName(null);
      return;
    }
    let cancelled = false;
    Workspace.bySlug(slug).then((ws) => {
      if (!cancelled) {
        setResolvedWorkspace(ws);
        setName(ws?.name ?? slug);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workspace?.name, workspace?.slug, slug]);

  useEffect(() => {
    if (!open || !switchable) return;
    let cancelled = false;
    setLoadingList(true);
    Workspace.all()
      .then((list) => {
        if (!cancelled) {
          const visible = filterWorkspacesForViewer(list, role);
          setWorkspaces(Workspace.orderWorkspaces(visible));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, switchable, role]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (!slug && !name) return null;

  const displayName = name || slug;
  const otherSpaces =
    workspaces.length > 0
      ? workspaces
      : slug
        ? [{ slug, name: displayName }]
        : [];

  function handleSelect(ws) {
    if (ws.slug === slug) {
      setOpen(false);
      return;
    }
    setOpen(false);
    if (typeof onWorkspaceSelect === "function") {
      onWorkspaceSelect(ws);
      return;
    }
    switchToWorkspace(navigate, ws);
  }

  const menuPlacementClass =
    menuPlacement === "above"
      ? " offerKp-space-switcher__menu--above"
      : "";

  const menu = open && switchable && (
    <div
      className={`offerKp-space-switcher__menu${menuPlacementClass}`}
      role="listbox"
    >
      <p className="offerKp-space-switcher__menu-label">
        {t("layout.otherSpaces")}
      </p>
      {loadingList && otherSpaces.length <= 1 ? (
        <p className="offerKp-space-switcher__loading">{t("layout.loadingSpaces")}</p>
      ) : (
        otherSpaces.map((ws) => {
          const isActive = ws.slug === slug;
          const wsProfile = getEffectiveWorkspaceProfile({
            userRole: role,
            workspace: ws,
          });
          return (
            <button
              key={ws.slug}
              type="button"
              role="option"
              aria-selected={isActive}
              className={`offerKp-space-switcher__option${isActive ? " offerKp-space-switcher__option--active" : ""}`}
              onClick={() => handleSelect(ws)}
            >
              <span
                className="offerKp-space-switcher__option-dot"
                style={{ background: wsProfile.color }}
                aria-hidden
              />
              <span className="offerKp-space-switcher__option-meta">
                <span className="offerKp-space-switcher__option-code">
                  {wsProfile.code}
                </span>
                <span className="offerKp-space-switcher__option-name">{ws.name}</span>
              </span>
              {isActive && (
                <Check size={14} weight="bold" className="shrink-0" aria-hidden />
              )}
            </button>
          );
        })
      )}
    </div>
  );

  if (variant === "compact") {
    return (
      <div ref={rootRef} className={`offerKp-space-switcher ${className}`}>
        <button
          type="button"
          className={`offerKp-space-indicator offerKp-space-indicator--compact offerKp-space-switcher__trigger${open ? " offerKp-space-switcher__trigger--open" : ""}`}
          title={`${t("layout.currentSpace")}: ${displayName}`}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => switchable && setOpen((v) => !v)}
          disabled={!switchable}
        >
          <span
            className="offerKp-space-indicator__role"
            style={{ background: identity.color }}
          >
            {identity.code}
          </span>
          <span className="offerKp-space-indicator__name">{displayName}</span>
          {switchable && (
            <CaretDown
              size={12}
              weight="bold"
              className={`offerKp-space-switcher__caret${open ? " offerKp-space-switcher__caret--open" : ""}`}
            />
          )}
        </button>
        {menu}
      </div>
    );
  }

  const profileBadge =
    variant === "sidebar" ? (
      <div
        className="offerKp-user-workspace-badge shrink-0"
        style={{ background: identity.color }}
      >
        USER WORKSPACE · {identity.code}
      </div>
    ) : null;

  return (
    <div ref={rootRef} className={`offerKp-space-switcher ${className}`}>
      {profileBadge}
      <div
        className={`offerKp-space-indicator offerKp-space-indicator--${variant}${switchable ? " offerKp-space-indicator--switchable" : ""}`}
      >
        <div className="offerKp-space-indicator__head">
          <Stack size={14} weight="fill" aria-hidden />
          <span className="offerKp-space-indicator__label">
            {displayName}
          </span>
        </div>
        <button
          type="button"
          className={`offerKp-space-indicator__body offerKp-space-switcher__trigger${open ? " offerKp-space-switcher__trigger--open" : ""}`}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={t("layout.switchSpace")}
          onClick={() => switchable && setOpen((v) => !v)}
          disabled={!switchable}
        >
          <span
            className="offerKp-space-indicator__role"
            style={{ background: identity.color }}
          >
            {identity.code}
          </span>
          <span className="offerKp-space-indicator__name" title={displayName}>
            {displayName}
          </span>
          {switchable && (
            <CaretDown
              size={14}
              weight="bold"
              className={`offerKp-space-switcher__caret${open ? " offerKp-space-switcher__caret--open" : ""}`}
            />
          )}
        </button>
      </div>
      {menu}
    </div>
  );
}
