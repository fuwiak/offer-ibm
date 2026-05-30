import { Navigate } from "react-router-dom";
import OfferKpPageShell from "@/components/OfferKp/OfferKpPageShell";
import AccountUsersPanel from "@/components/OfferKp/AccountUsersPanel";
import useOfferKpRole from "@/hooks/useOfferKpRole";
import paths from "@/utils/paths";
import { useTranslation } from "react-i18next";

export default function AccountUsersPage() {
  const { t } = useTranslation("offerKp");
  const { isAdmin } = useOfferKpRole();

  if (!isAdmin) {
    return <Navigate to={paths.offerKp.profile()} replace />;
  }

  return (
    <OfferKpPageShell
      title={t("account.usersTitle")}
      subtitle={t("account.usersSubtitle")}
    >
      <AccountUsersPanel />
    </OfferKpPageShell>
  );
}
