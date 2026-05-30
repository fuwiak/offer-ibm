import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  NOTIFICATION_TYPE_ICON,
  timeAgo,
} from "@/utils/lawyerRevizorro/notifications";

export default function NotificationList({ notifications }) {
  const { t } = useTranslation("lawyerRevizorro");

  if (notifications.length === 0) {
    return (
      <p className="text-sm text-theme-text-secondary text-center py-12">
        {t("notifications.empty")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col border border-theme-sidebar-border divide-y divide-theme-sidebar-border">
      {notifications.map((n) => (
        <li
          key={n.id}
          className={`flex gap-3 p-4 bg-theme-bg-primary ${
            !n.read ? "bg-theme-sidebar-item-selected/40" : ""
          }`}
        >
          <span className="text-lg shrink-0" aria-hidden>
            {NOTIFICATION_TYPE_ICON[n.type] ?? "🔔"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-theme-text-secondary uppercase tracking-wide mb-1">
              {t(`notifications.types.${n.type}`, { defaultValue: n.type })}
            </p>
            {n.href ? (
              <Link
                to={n.href}
                className="text-sm text-theme-text-primary hover:text-primary-button"
              >
                {n.message}
              </Link>
            ) : (
              <p className="text-sm text-theme-text-primary">{n.message}</p>
            )}
            <p className="text-xs text-theme-text-secondary mt-1">{timeAgo(n.at)}</p>
          </div>
          {!n.read && (
            <span
              className="w-2 h-2 mt-2 bg-primary-button shrink-0"
              aria-label="Unread"
            />
          )}
        </li>
      ))}
    </ul>
  );
}
