"use strict";

/** Допустимые теги негативного фидбэка (legal RAG). */
const RAG_FEEDBACK_TAGS = [
  "fabricated_citation", // ссылка на несуществующий документ
  "wrong_jurisdiction", // неверная юрисдикция
  "outdated_law", // устаревшая норма
  "web_not_garant", // ответ основан на вебе, а не на ГАРАНТ
  "other", // иное
];

const ALLOWED = new Set(RAG_FEEDBACK_TAGS);

const MAX_COMMENT_LEN = 1000;

/**
 * Санитизирует массив тегов фидбэка перед записью в БД.
 * @param {unknown} tags
 * @returns {string[]|null} null = не менять поле в БД
 */
function sanitizeFeedbackTags(tags) {
  if (tags === undefined) return null;
  if (tags === null) return [];
  if (!Array.isArray(tags)) return [];
  return tags.filter((t) => typeof t === "string" && ALLOWED.has(t));
}

/**
 * Санитизирует произвольный комментарий пользователя.
 * @param {unknown} comment
 * @returns {string|null|undefined} undefined = не менять поле в БД
 */
function sanitizeFeedbackComment(comment) {
  if (comment === undefined) return undefined;
  if (comment === null) return null;
  if (typeof comment !== "string") return null;
  const trimmed = comment.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_COMMENT_LEN
    ? trimmed.slice(0, MAX_COMMENT_LEN)
    : trimmed;
}

module.exports = {
  RAG_FEEDBACK_TAGS,
  sanitizeFeedbackTags,
  sanitizeFeedbackComment,
};
