import { useLocation, useParams } from "react-router-dom";
import { shouldUseOfferKpLayout } from "@/utils/offerKp/detectOfferKpMode";
import UserButton from "./UserButton";

export default function UserMenu({ children }) {
  const { pathname } = useLocation();
  const { slug } = useParams();
  const offerKpMode = shouldUseOfferKpLayout({ pathname, workspaceSlug: slug });

  return (
    <div className="relative flex flex-1 min-w-0 h-full w-full min-h-0">
      {!offerKpMode && <UserButton />}
      {children}
    </div>
  );
}
