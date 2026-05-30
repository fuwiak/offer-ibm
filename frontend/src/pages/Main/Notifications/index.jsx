import LawyerRevizorroPageShell from "@/components/LawyerRevizorro/LawyerRevizorroPageShell";
import NotificationsView from "@/components/LawyerRevizorro/NotificationsView";
import { useTranslation } from "react-i18next";

export default function NotificationsPage() {
  const { t } = useTranslation("lawyerRevizorro");
  return (
    <LawyerRevizorroPageShell
      title={t("layout.notifications")}
      subtitle={t("notifications.subtitle")}
    >
      <NotificationsView />
    </LawyerRevizorroPageShell>
  );
}
