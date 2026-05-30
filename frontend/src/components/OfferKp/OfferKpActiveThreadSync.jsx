import { useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useOfferKp } from "@/contexts/OfferKpContext";

/** Keeps right panel (memory / instructions / files) in sync with the active conversation. */
export default function OfferKpActiveThreadSync({
  workspaceSlug = null,
  threadSlug = null,
}) {
  const { pathname } = useLocation();
  const { slug: routeWs, threadSlug: routeThread } = useParams();
  const { setActiveConversation } = useOfferKp();

  useEffect(() => {
    const ws =
      workspaceSlug ??
      routeWs ??
      (pathname.startsWith("/workspace/") ? routeWs : null);
    const thread =
      threadSlug ??
      routeThread ??
      null;
    setActiveConversation(ws || null, thread || null);
  }, [
    workspaceSlug,
    threadSlug,
    routeWs,
    routeThread,
    pathname,
    setActiveConversation,
  ]);

  return null;
}
