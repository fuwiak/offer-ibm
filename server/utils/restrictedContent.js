/**
 * Защита от документов с пометкой «Для служебного пользования» (ДСП).
 *
 * Проверяется только первая страница документа на наличие полной формулировки
 * «Для служебного пользования» и её вариаций. Такие документы не допускаются
 * к загрузке/обработке.
 *
 * Отдельно аббревиатуру «ДСП» намеренно НЕ проверяем — иначе блокировались бы
 * документы с номерами вида «1783-ДСП».
 */

/** Только полная формулировка (проверка без учёта регистра). */
const RESTRICTED_PHRASES = ["для служебного пользования"];

/** Ограничение по длине: проверяем только объём, условно соответствующий первой странице. */
const FIRST_PAGE_MAX_CHARS = 5000;

const RESTRICTED_MESSAGE =
  "Загрузка этого файла запрещена: в документе обнаружена пометка «Для служебного пользования».";

/**
 * Проверяет первую страницу текста на наличие пометки «Для служебного пользования».
 * Текст нормализуется по пробелам и регистру перед поиском.
 *
 * @param {string} firstPageText - Текст первой страницы документа (после парсинга Collector).
 * @returns {boolean} true, если документ помечен «Для служебного пользования».
 */
function hasRestrictedContent(firstPageText) {
  if (!firstPageText || typeof firstPageText !== "string") return false;
  const firstPageOnly = firstPageText.slice(0, FIRST_PAGE_MAX_CHARS);
  const normalized = firstPageOnly.replace(/\s+/g, " ").trim().toLowerCase();
  return RESTRICTED_PHRASES.some((phrase) => normalized.includes(phrase));
}

/**
 * Сообщение об ошибке, показываемое пользователю при блокировке ДСП-документа.
 * @returns {string}
 */
function getRestrictedMessage() {
  return RESTRICTED_MESSAGE;
}

module.exports = {
  hasRestrictedContent,
  getRestrictedMessage,
  RESTRICTED_PHRASES,
  FIRST_PAGE_MAX_CHARS,
  RESTRICTED_MESSAGE,
};
