import {
  OFFER_KP_BOT_PROFILES,
  getOfferKpBotProfilePrompt,
  getOfferKpBotProfileLabel,
} from "@/config/offerKpBotProfilePrompts";

export { OFFER_KP_BOT_PROFILES, getOfferKpBotProfilePrompt, getOfferKpBotProfileLabel };

/**
 * @param {string} currentProfile
 * @param {string} currentPrompt
 * @param {string} newProfile
 * @param {(key: string, opts?: object) => string} t
 * @returns {{ apply: boolean, nextPrompt: string }}
 */
export function resolveProfilePromptChange(currentProfile, currentPrompt, newProfile, t) {
  const nextPrompt = getOfferKpBotProfilePrompt(newProfile);
  const previousDefault = getOfferKpBotProfilePrompt(currentProfile);
  const trimmed = (currentPrompt || "").trim();
  const edited =
    trimmed.length > 0 &&
    trimmed !== (previousDefault || "").trim() &&
    trimmed !== (nextPrompt || "").trim();

  if (edited) {
    const label = getOfferKpBotProfileLabel(newProfile);
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
