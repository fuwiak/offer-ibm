import { Navigate } from "react-router-dom";
import LawyerRevizorroPageShell from "@/components/LawyerRevizorro/LawyerRevizorroPageShell";
import AccountUsersPanel from "@/components/LawyerRevizorro/AccountUsersPanel";
import useLawyerRevizorroRole from "@/hooks/useLawyerRevizorroRole";
import paths from "@/utils/paths";
import { useTranslation } from "react-i18next";

export default function AccountUsersPage() {
  const { t } = useTranslation("lawyerRevizorro");
  const { isAdmin } = useLawyerRevizorroRole();

  if (!isAdmin) {
    return <Navigate to={paths.lawyerRevizorro.profile()} replace />;
  }

  return (
    <LawyerRevizorroPageShell
      title={t("account.usersTitle")}
      subtitle={t("account.usersSubtitle")}
    >
      <AccountUsersPanel />
    </LawyerRevizorroPageShell>
  );
}
