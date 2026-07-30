"use strict";

function draftLines(quoteDraft) {
  const lines = quoteDraft?.hardwareLines || quoteDraft?.preview?.lines || [];
  return Array.isArray(lines) ? lines : [];
}

function draftTotal(quoteDraft) {
  return draftLines(quoteDraft).reduce((sum, line) => {
    const explicit = Number(line?.lineTotal);
    if (Number.isFinite(explicit)) return sum + explicit;
    const qty = Number(line?.quantity) || 0;
    const unitPrice = Number(line?.unitPriceNet) || 0;
    return sum + qty * unitPrice;
  }, 0);
}

function replyLanguage(message = "") {
  const text = String(message || "");
  if (/[а-яё]/iu.test(text)) return "ru";
  if (/[ąćęłńóśźż]|\b(?:jaka|ile|suma|razem|lista|pozycj)/iu.test(text))
    return "pl";
  return "en";
}

function formatMoney(value, language) {
  const locale =
    language === "ru" ? "ru-RU" : language === "pl" ? "pl-PL" : "en-US";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function resolveDraftReadCommand({ command, message, quoteDraft } = {}) {
  const supported = new Set([
    "quote_get_total",
    "quote_get_line_count",
    "quote_get_summary",
  ]);
  if (!supported.has(command)) return null;

  const lines = draftLines(quoteDraft);
  const language = replyLanguage(message);
  if (!lines.length) {
    const text =
      language === "ru"
        ? "Текущий список позиций пока не сформирован."
        : language === "pl"
          ? "Bieżąca lista pozycji nie została jeszcze utworzona."
          : "The current item list has not been created yet.";
    return { text, command, lineCount: 0, total: 0 };
  }

  const total = draftTotal(quoteDraft);
  const currency = String(
    quoteDraft?.currency || quoteDraft?.preview?.currency || "RUB"
  ).trim();
  const amount = `${formatMoney(total, language)} ${currency}`;
  let text;
  if (command === "quote_get_line_count") {
    text =
      language === "ru"
        ? `В текущем списке позиций: ${lines.length}.`
        : language === "pl"
          ? `Bieżąca lista zawiera ${lines.length} pozycji.`
          : `The current list contains ${lines.length} items.`;
  } else if (command === "quote_get_summary") {
    text =
      language === "ru"
        ? `В текущем списке ${lines.length} поз.; общая сумма: ${amount}.`
        : language === "pl"
          ? `Bieżąca lista: ${lines.length} pozycji; łączna suma: ${amount}.`
          : `Current list: ${lines.length} items; total: ${amount}.`;
  } else {
    text =
      language === "ru"
        ? `Общая сумма по текущему списку: ${amount}.`
        : language === "pl"
          ? `Łączna suma bieżącej listy: ${amount}.`
          : `The current list total is ${amount}.`;
  }
  return { text, command, lineCount: lines.length, total, currency };
}

module.exports = {
  draftLines,
  draftTotal,
  resolveDraftReadCommand,
};
