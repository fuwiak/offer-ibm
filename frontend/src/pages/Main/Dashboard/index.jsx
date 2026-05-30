import LawyerRevizorroPageShell from "@/components/LawyerRevizorro/LawyerRevizorroPageShell";
import PartnerDashboard from "@/components/LawyerRevizorro/PartnerDashboard";
import { useTranslation } from "react-i18next";

export default function DashboardPage() {
  const { t } = useTranslation("lawyerRevizorro");
  return (
    <LawyerRevizorroPageShell
      title={t("home.quickActions.dashboard")}
      subtitle={t("dashboard.subtitle")}
    >
      <PartnerDashboard />
    </LawyerRevizorroPageShell>
  );
}
