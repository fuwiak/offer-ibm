import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Workspace from "@/models/workspace";
import { PENDING_HOME_MESSAGE } from "@/utils/constants";
import { HOME_CHAT_PROMPTS } from "@/utils/offerKp/homeActions";
import { resolvePartnerWorkspace } from "@/utils/offerKp/partnerWorkspace";
import paths from "@/utils/paths";
import { FullScreenLoader } from "@/components/Preloader";
import { useTranslation } from "react-i18next";

/**
 * Starts a partner conversation in the offer-kp workspace shell (not legacy home).
 */
export default function ChatLauncherPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function launch() {
      try {
        const workspace = await resolvePartnerWorkspace(t("new-workspace.placeholder"));
        if (!workspace || cancelled) {
          setError("No workspace available");
          return;
        }

        const { thread } = await Workspace.threads.new(workspace.slug);
        if (!thread || cancelled) return;

        const intent = params.get("intent");
        const customMessage = params.get("message");
        const message =
          customMessage?.trim() ||
          (intent && HOME_CHAT_PROMPTS[intent]) ||
          HOME_CHAT_PROMPTS.technical;

        if (!message?.trim()) {
          if (!cancelled) navigate(paths.offerKp.home(), { replace: true });
          return;
        }

        sessionStorage.setItem(
          PENDING_HOME_MESSAGE,
          JSON.stringify({ message, attachments: [], pendingAt: Date.now() })
        );

        navigate(paths.offerKp.thread(workspace.slug, thread.slug), { replace: true });
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Could not start conversation");
      }
    }

    launch();
    return () => {
      cancelled = true;
    };
  }, [navigate, params, t]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-theme-text-secondary">
        {error}
      </div>
    );
  }

  return <FullScreenLoader />;
}
