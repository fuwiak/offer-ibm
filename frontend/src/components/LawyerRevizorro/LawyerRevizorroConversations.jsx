import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ThreadContainer from "@/components/Sidebar/ActiveWorkspaces/ThreadContainer";
import { resolvePartnerWorkspace } from "@/utils/lawyerRevizorro/partnerWorkspace";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

export default function LawyerRevizorroConversations() {
  const { t } = useTranslation("lawyerRevizorro");
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const ws = await resolvePartnerWorkspace();
      if (!cancelled) {
        setWorkspace(ws);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="lawyerRevizorro-conversations flex flex-col flex-1 min-h-0 overflow-hidden mt-2 pt-2 border-t border-theme-sidebar-border">
      <p className="lawyerRevizorro-conversations__label px-2 mb-2 shrink-0">
        {t("layout.conversations")}
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto px-1">
        {loading ? (
          <Skeleton.default
            height={32}
            width="100%"
            count={4}
            baseColor="var(--theme-sidebar-item-default)"
            highlightColor="var(--theme-sidebar-item-hover)"
            className="mb-1"
          />
        ) : workspace ? (
          <ThreadContainer workspace={workspace} isVirtualThread={isHome} />
        ) : (
          <p className="text-xs text-theme-text-secondary px-2 py-4 text-center">
            {t("conversations.empty")}
          </p>
        )}
      </div>
    </div>
  );
}
