import paths from "@/utils/paths";

export const LAWYER_REVIZORRO_NEW_CONVERSATION_EVENT = "lawyerRevizorro:new-conversation";

/** Reset lawyer-revizorro home chat and show the empty composer (works when already on `/`). */
export function startNewConversation(navigate) {
  const ts = Date.now();
  window.dispatchEvent(new CustomEvent(LAWYER_REVIZORRO_NEW_CONVERSATION_EVENT));
  navigate({
    pathname: paths.lawyerRevizorro.home(),
    search: `?new=${ts}`,
  }, { replace: true });
}
