/** i18n keys under `home.newChatFollowUps.items.*` — KP-focused starters for empty chat. */
export const NEW_CHAT_KP_FOLLOW_UP_KEYS = [
  "parseInquiry",
  "draftFromList",
  "findAnalogs",
  "checkStock",
  "exportQuoteDoc",
];

/**
 * Deterministic chips right after file upload (RU — primary locale).
 * Prefer buildUploadStarterFollowUpTexts(filename) when a name is known.
 * Keep in sync with server `buildUploadStarterFollowUps` and intentRouter phrases.
 */
export const UPLOAD_STARTER_FOLLOW_UP_TEXTS_RU = [
  "Сделай КП по прикреплённой заявке",
  "Покажи сводку позиций из загруженного файла",
  "Найди аналоги для позиций без наличия",
];

export {
  buildUploadStarterFollowUpTexts,
  shortFilename,
} from "@/utils/offerKp/contextActions";

/** i18n keys under `home.uploadFollowUps.items.*` */
export const UPLOAD_FOLLOW_UP_KEYS = [
  "makeQuote",
  "showSummary",
  "findAnalogs",
];
