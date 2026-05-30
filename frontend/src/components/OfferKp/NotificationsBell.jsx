import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useOfferKp } from "@/contexts/OfferKpContext";
import paths from "@/utils/paths";
import {
  NOTIFICATION_TYPE_ICON,
  timeAgo,
} from "@/utils/offerKp/notifications";

export default function NotificationsBell() {
  const { t } = useTranslation("offerKp");
  const { notifications, unreadCount, markAllRead, refreshNotifications } =
    useOfferKp();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function toggle() {
    setOpen((v) => {
      if (!v) refreshNotifications();
      return !v;
    });
  }

  const preview = notifications.slice(0, 6);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={toggle}
        className="offerKp-notifications-bell border-none bg-transparent p-2 cursor-pointer text-theme-text-primary hover:bg-theme-sidebar-item-hover relative"
        aria-label={t("layout.notifications")}
        aria-expanded={open}
      >
        <Bell size={22} weight={unreadCount > 0 ? "fill" : "regular"} />
        {unreadCount > 0 && (
          <span className="offerKp-notifications-bell__badge" aria-hidden>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="offerKp-notifications-dropdown"
          role="dialog"
          aria-label={t("layout.notifications")}
        >
          <div className="offerKp-notifications-dropdown__header">
            <div>
              <p className="offerKp-document-panel__eyebrow mb-0">
                {t("layout.notifications")}
              </p>
              <p className="text-xs text-theme-text-secondary mt-1 max-w-[240px]">
                {t("notifications.subtitle")}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead()}
                className="text-xs text-primary-button border-none bg-transparent cursor-pointer whitespace-nowrap"
              >
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>

          <div className="offerKp-notifications-dropdown__list">
            {preview.length === 0 ? (
              <p className="text-sm text-theme-text-secondary text-center py-8 px-4">
                {t("notifications.empty")}
              </p>
            ) : (
              preview.map((n) => (
                <div
                  key={n.id}
                  className={`offerKp-notifications-dropdown__item ${
                    !n.read ? "offerKp-notifications-dropdown__item--unread" : ""
                  }`}
                >
                  <span className="text-base shrink-0" aria-hidden>
                    {NOTIFICATION_TYPE_ICON[n.type] ?? "🔔"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-theme-text-secondary mb-0.5">
                      {t(`notifications.types.${n.type}`, { defaultValue: n.type })}
                    </p>
                    {n.href ? (
                      <Link
                        to={n.href}
                        onClick={() => setOpen(false)}
                        className="text-sm text-theme-text-primary hover:text-primary-button leading-snug"
                      >
                        {n.message}
                      </Link>
                    ) : (
                      <p className="text-sm text-theme-text-primary leading-snug">
                        {n.message}
                      </p>
                    )}
                    <p className="text-xs text-theme-text-secondary mt-1">
                      {timeAgo(n.at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <Link
            to={paths.offerKp.notifications()}
            onClick={() => setOpen(false)}
            className="offerKp-notifications-dropdown__footer"
          >
            {t("notifications.viewAll")}
          </Link>
        </div>
      )}
    </div>
  );
}
