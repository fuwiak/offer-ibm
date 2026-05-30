import OfferKpPageShell from "@/components/OfferKp/OfferKpPageShell";
import PartnerDashboard from "@/components/OfferKp/PartnerDashboard";
import { useTranslation } from "react-i18next";

export default function DashboardPage() {
  const { t } = useTranslation("offerKp");
  return (
    <OfferKpPageShell
      title={t("home.quickActions.dashboard")}
      subtitle={t("dashboard.subtitle")}
    >
      <PartnerDashboard />
    </OfferKpPageShell>
  );
}
