/** Допустимые теги негативного фидбэка (legal RAG). */
const RAG_FEEDBACK_TAGS = [
  "fabricated_citation",
  "wrong_jurisdiction",
  "outdated_law",
  "web_not_garant",
  "other",
];

const ALLOWED = new Set(RAG_FEEDBACK_TAGS);

/**
 * @param {unknown} tags
 * @returns {string[]|null} null = не менять поле в БД
 */
function sanitizeFeedbackTags(tags) {
  if (tags === undefined) return null;
  if (tags === null) return [];
  if (!Array.isArray(tags)) return [];
  const out = [];
  for (const t of tags) {
    if (typeof t === "string" && ALLOWED.has(t) && !out.includes(t)) {
      out.push(t);
      if (out.length >= 10) break;
    }
  }
  return out;
}

/**
 * @param {unknown} comment
 * @returns {string|null|undefined} undefined = не менять
 */
function sanitizeFeedbackComment(comment) {
  if (comment === undefined) return undefined;
  if (comment === null || comment === "") return null;
  const s = String(comment).trim();
  return s.length > 2000 ? s.slice(0, 2000) : s;
}

module.exports = {
  RAG_FEEDBACK_TAGS,
  sanitizeFeedbackTags,
  sanitizeFeedbackComment,
};
