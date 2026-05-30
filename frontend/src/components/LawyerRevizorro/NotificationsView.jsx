import { useLawyerRevizorro } from "@/contexts/LawyerRevizorroContext";
import { useTranslation } from "react-i18next";
import NotificationList from "@/components/LawyerRevizorro/NotificationList";

export default function NotificationsView() {
  const { t } = useTranslation("lawyerRevizorro");
  const { notifications, markAllRead, unreadCount } = useLawyerRevizorro();

  return (
    <div className="max-w-3xl">
      {unreadCount > 0 && (
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={markAllRead}
            className="carbon-tertiary-btn text-sm px-4 py-2"
          >
            {t("notifications.markAllRead")}
          </button>
        </div>
      )}
      <NotificationList notifications={notifications} />
    </div>
  );
}
