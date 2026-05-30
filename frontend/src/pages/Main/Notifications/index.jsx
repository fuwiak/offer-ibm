import OfferKpPageShell from "@/components/OfferKp/OfferKpPageShell";
import NotificationsView from "@/components/OfferKp/NotificationsView";
import { useTranslation } from "react-i18next";

export default function NotificationsPage() {
  const { t } = useTranslation("offerKp");
  return (
    <OfferKpPageShell
      title={t("layout.notifications")}
      subtitle={t("notifications.subtitle")}
    >
      <NotificationsView />
    </OfferKpPageShell>
  );
}
