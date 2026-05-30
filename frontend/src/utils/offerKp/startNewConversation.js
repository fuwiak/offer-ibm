import paths from "@/utils/paths";

export const OFFER_KP_NEW_CONVERSATION_EVENT = "offerKp:new-conversation";

/** Reset offer-kp home chat and show the empty composer (works when already on `/`). */
export function startNewConversation(navigate) {
  const ts = Date.now();
  window.dispatchEvent(new CustomEvent(OFFER_KP_NEW_CONVERSATION_EVENT));
  navigate({
    pathname: paths.offerKp.home(),
    search: `?new=${ts}`,
  }, { replace: true });
}
