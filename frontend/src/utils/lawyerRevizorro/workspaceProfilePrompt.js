import {
  LAWYER_REVIZORRO_BOT_PROFILES,
  getLawyerRevizorroBotProfilePrompt,
  getLawyerRevizorroBotProfileLabel,
} from "@/config/lawyerRevizorroBotProfilePrompts";

export { LAWYER_REVIZORRO_BOT_PROFILES, getLawyerRevizorroBotProfilePrompt, getLawyerRevizorroBotProfileLabel };

/**
 * @param {string} currentProfile
 * @param {string} currentPrompt
 * @param {string} newProfile
 * @param {(key: string, opts?: object) => string} t
 * @returns {{ apply: boolean, nextPrompt: string }}
 */
export function resolveProfilePromptChange(currentProfile, currentPrompt, newProfile, t) {
  const nextPrompt = getLawyerRevizorroBotProfilePrompt(newProfile);
  const previousDefault = getLawyerRevizorroBotProfilePrompt(currentProfile);
  const trimmed = (currentPrompt || "").trim();
  const edited =
    trimmed.length > 0 &&
    trimmed !== (previousDefault || "").trim() &&
    trimmed !== (nextPrompt || "").trim();

  if (edited) {
    const label = getLawyerRevizorroBotProfileLabel(newProfile);
    const ok = window.confirm(
      t("admin.profilePromptReplaceConfirm", {
        profile: label,
        defaultValue: `Replace current prompt with the ${label} default?`,
      })
    );
    if (!ok) return { apply: false, nextPrompt: currentPrompt };
  }

  return { apply: true, nextPrompt };
}
