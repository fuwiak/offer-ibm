import { useLawyerRevizorro } from "@/contexts/LawyerRevizorroContext";
import { Bell, X } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import paths from "@/utils/paths";
import {
  NOTIFICATION_TYPE_ICON,
  timeAgo,
} from "@/utils/lawyerRevizorro/notifications";

export default function NotificationsPanel({ onClose }) {
  const { t } = useTranslation("lawyerRevizorro");
  const { notifications, markAllRead, unreadCount } = useLawyerRevizorro();

  return (
    <div className="flex flex-col h-full min-h-[320px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-theme-sidebar-border shrink-0">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-theme-text-secondary" />
          <span className="text-xs font-semibold text-theme-text-primary">
            {t("layout.notifications")}
          </span>
          {unreadCount > 0 && (
            <span className="text-[10px] bg-primary-button text-white px-1.5 py-0.5 font-medium">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-[10px] text-primary-button border-none bg-transparent cursor-pointer"
            >
              {t("notifications.markAllRead")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-theme-text-secondary border-none bg-transparent p-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <p className="text-[11px] text-theme-text-secondary px-3 py-2 border-b border-theme-sidebar-border">
        {t("notifications.subtitle")}
      </p>

      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="text-xs text-theme-text-secondary p-4 text-center">
            {t("notifications.empty")}
          </p>
        ) : (
          notifications.slice(0, 8).map((n) => (
            <div
              key={n.id}
              className={`px-3 py-2.5 border-b border-theme-sidebar-border flex gap-2 ${
                !n.read ? "bg-theme-sidebar-item-selected/50" : ""
              }`}
            >
              <span className="text-sm mt-0.5">{NOTIFICATION_TYPE_ICON[n.type] ?? "🔔"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-theme-text-secondary">
                  {t(`notifications.types.${n.type}`, { defaultValue: n.type })}
                </p>
                {n.href ? (
                  <Link
                    to={n.href}
                    className="text-[11px] leading-relaxed text-theme-text-primary hover:text-primary-button"
                  >
                    {n.message}
                  </Link>
                ) : (
                  <p className="text-[11px] leading-relaxed text-theme-text-primary">
                    {n.message}
                  </p>
                )}
                <p className="text-[10px] text-theme-text-secondary mt-0.5">
                  {timeAgo(n.at)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <Link
        to={paths.lawyerRevizorro.notifications()}
        onClick={onClose}
        className="block text-center text-xs text-primary-button py-3 border-t border-theme-sidebar-border"
      >
        {t("notifications.viewAll")}
      </Link>
    </div>
  );
}
