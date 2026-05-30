import { useLocation, useParams } from "react-router-dom";
import NotificationsBell from "@/components/LawyerRevizorro/NotificationsBell";
import { shouldUseLawyerRevizorroLayout } from "@/utils/lawyerRevizorro/detectLawyerRevizorroMode";
import UserButton from "./UserButton";

export default function UserMenu({ children }) {
  const { pathname } = useLocation();
  const { slug } = useParams();
  const lawyerRevizorroMode = shouldUseLawyerRevizorroLayout({ pathname, workspaceSlug: slug });

  return (
    <div className="relative flex flex-1 min-w-0 h-full w-full min-h-0">
      {lawyerRevizorroMode ? (
        <div className="lawyerRevizorro-header-actions">
          <NotificationsBell />
          <UserButton embedded />
        </div>
      ) : (
        <UserButton />
      )}
      {children}
    </div>
  );
}
