import NotificationsBell from "@/components/OfferKp/NotificationsBell";
import TextSizeMenu from "@/components/WorkspaceChat/ChatContainer/TextSizeMenu";
import UserButton from "@/components/UserMenu/UserButton";

/** Notifications, text size, and profile — top-right of the main content column only. */
export default function OfferKpHeaderActions() {
  return (
    <div className="offerKp-header-actions">
      <NotificationsBell />
      <TextSizeMenu embedded />
      <UserButton embedded />
    </div>
  );
}
