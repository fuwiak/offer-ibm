import { useNavigate } from "react-router-dom";
import { startNewConversation } from "@/utils/lawyerRevizorro/startNewConversation";

export default function LawyerRevizorroSidebarBrand() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="block mb-3 no-underline w-full text-left bg-transparent border-0 p-0 cursor-pointer"
      onClick={() => startNewConversation(navigate)}
      aria-label="New conversation"
    >
      <div className="lawyerRevizorro-brand__title">lawyer-revizorro</div>
      <div className="lawyerRevizorro-brand__subtitle">Enterprise Suite</div>
    </button>
  );
}
