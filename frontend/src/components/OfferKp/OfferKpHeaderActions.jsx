import TextSizeMenu from "@/components/WorkspaceChat/ChatContainer/TextSizeMenu";
import UserButton from "@/components/UserMenu/UserButton";

/** Text size and profile — top-right of the main content column only. */
export default function OfferKpHeaderActions() {
  return (
    <div className="offerKp-header-actions">
      <TextSizeMenu embedded />
      <UserButton embedded />
    </div>
  );
}
