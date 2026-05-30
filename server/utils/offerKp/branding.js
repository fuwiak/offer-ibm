const DEFAULT_APP_NAME = "OfferKP";
const DEFAULT_META_TITLE = "OfferKP | Формирование коммерческих предложений";

const LEGACY_APP_NAMES = new Set([
  "offer-kp",
  "offerKp",
  "AI Lawyer & Auditor Assistant",
  "AI Lawyer",
  "ИИ Юрист и Аудитор",
  "ИИ Юрист",
]);

function normalizeAppName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed || LEGACY_APP_NAMES.has(trimmed)) return DEFAULT_APP_NAME;
  return trimmed;
}

function normalizeMetaTitle(title) {
  const trimmed = String(title || "").trim();
  if (
    !trimmed ||
    LEGACY_APP_NAMES.has(trimmed) ||
    trimmed.includes("offer-kp") ||
    trimmed.includes("Your personal LLM trained on anything")
  ) {
    return DEFAULT_META_TITLE;
  }
  return trimmed;
}

module.exports = {
  DEFAULT_APP_NAME,
  DEFAULT_META_TITLE,
  LEGACY_APP_NAMES,
  normalizeAppName,
  normalizeMetaTitle,
};
