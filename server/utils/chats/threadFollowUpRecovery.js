"use strict";

const MAX_SUGGESTIONS = 3;

function detectUiLanguage(prompt = "", hint = null) {
  const h = String(hint || "")
    .trim()
    .toLowerCase();
  if (h.startsWith("ru")) return "ru";
  if (h.startsWith("pl")) return "pl";
  if (h.startsWith("en")) return "en";

  const text = String(prompt || "");
  if (/[ąćęłńóśźż]/i.test(text) || /\b(dodaj|prosz|ofert|cena)\b/i.test(text)) {
    return "pl";
  }
  if (/[а-яё]/i.test(text)) return "ru";
  return "en";
}

function wantsQuoteFlow(text = "") {
  return /коммерческ|\bкп\b|оферт|ofert|quote|offer\.docx|\.docx|\.pdf|create-docx|word document/i.test(
    text
  );
}

function hasCatalogData(text = "") {
  return /\[каталог\s*·|===\s*данные каталога/i.test(String(text || ""));
}

function hasPriceSignals(text = "") {
  return /цена:\s*[\d.,]+|руб|\brub\b|\d+[.,]\d{2}\s*(rub|pln|руб)/i.test(
    String(text || "")
  );
}

/**
 * @param {{ prompt?: string, assistantText?: string, catalogInjected?: boolean }} ctx
 * @returns {string[]}
 */
function detectFollowUpIssues({
  prompt = "",
  assistantText = "",
  catalogInjected = false,
} = {}) {
  const combined = `${prompt}\n${assistantText}`;
  if (!wantsQuoteFlow(combined)) return [];

  const issues = [];
  const assistant = String(assistantText || "");
  const userPrompt = String(prompt || "");

  if (!catalogInjected && !hasCatalogData(userPrompt)) {
    issues.push("missing_catalog");
  }
  if (
    /шаблон|template|заполн|do uzupełnienia|fill in|placeholder|\[цена\]/i.test(
      assistant
    )
  ) {
    issues.push("empty_template");
  }
  if (
    /\.docx|word document|create-docx-file/i.test(assistant) &&
    !hasPriceSignals(assistant)
  ) {
    issues.push("doc_without_prices");
  }
  if (
    /нет доступа к (?:бд|базе|каталог|цен)|no access to (?:db|catalog|prices)/i.test(
      assistant
    )
  ) {
    issues.push("agent_denied_catalog");
  }
  if (
    wantsQuoteFlow(userPrompt) &&
    !hasPriceSignals(assistant) &&
    issues.length === 0
  ) {
    issues.push("quote_without_prices");
  }

  return [...new Set(issues)];
}

const RECOVERY_SUGGESTIONS = {
  missing_catalog: {
    ru: [
      "Почему в КП нет цен? Подставь каталог purolat.com и переделай DOCX с позициями и SKU",
      "Найди товары в каталоге по моему запросу и сформируй КП с ценами",
    ],
    pl: [
      "Dlaczego w ofercie nie ma cen? Wstaw katalog purolat.com i przebuduj DOCX z pozycjami i SKU",
      "Znajdź produkty w katalogu i przygotuj ofertę z cenami",
    ],
    en: [
      "Why are catalog prices missing? Inject purolat.com catalog blocks and rebuild the DOCX with SKUs",
      "Search the catalog for my items and generate a quote with prices",
    ],
  },
  empty_template: {
    ru: [
      "В DOCX только шаблон — заполни таблицу ценами из [Каталог · purolat.com]",
      "Переделай offer.docx: все строки, количества, единицы и статусы из каталога",
    ],
    pl: [
      "W DOCX jest tylko szablon — uzupełnij tabelę cenami z [Katalog · purolat.com]",
      "Przebuduj offer.docx: wszystkie pozycje, ilości, jednostki i statusy z katalogu",
    ],
    en: [
      "The DOCX is only a template — fill the table with [Catalog · purolat.com] prices",
      "Rebuild offer.docx with all line items, quantities, units, and stock status from the catalog",
    ],
  },
  doc_without_prices: {
    ru: [
      "Файл создан без цен — что пошло не так с каталогом и как исправить КП?",
      "Сформируй КП заново с таблицей позиций, ценами RUB и статусами наличия",
    ],
    pl: [
      "Plik bez cen — co poszło nie tak z katalogiem i jak naprawić ofertę?",
      "Wygeneruj ofertę ponownie z tabelą pozycji, cenami i statusem magazynowym",
    ],
    en: [
      "The file has no prices — what went wrong with the catalog and how to fix the quote?",
      "Regenerate the quote with a line table, RUB prices, and stock status",
    ],
  },
  agent_denied_catalog: {
    ru: [
      "У тебя есть блок каталога в сообщении — используй его и покажи цены по позициям",
      "Повтори КП только с данными purolat.com, без отказа от базы",
    ],
    pl: [
      "Masz blok katalogu w wiadomości — użyj go i pokaż ceny pozycji",
      "Powtórz ofertę wyłącznie z danymi purolat.com",
    ],
    en: [
      "You have catalog blocks in the message — use them and list prices per line",
      "Retry the quote using only purolat.com catalog data",
    ],
  },
  quote_without_prices: {
    ru: [
      "Что не так с КП — почему нет цен и как их подставить из каталога?",
      "Проверь наличие и цены по позициям, затем обнови DOCX/PDF",
    ],
    pl: [
      "Co jest nie tak z ofertą — dlaczego brak cen i jak je wstawić z katalogu?",
      "Sprawdź stany i ceny pozycji, potem zaktualizuj DOCX/PDF",
    ],
    en: [
      "What is wrong with the quote — why no prices and how to pull them from the catalog?",
      "Check stock and prices for each line, then update the DOCX/PDF",
    ],
  },
};

/**
 * @param {{ issues?: string[], prompt?: string, language?: string|null }} opts
 * @returns {string[]}
 */
function buildRecoveryFollowUpSuggestions({
  issues = [],
  prompt = "",
  language = null,
} = {}) {
  if (!issues.length) return [];

  const lang = detectUiLanguage(prompt, language);
  const picked = [];
  const seen = new Set();

  for (const issue of issues) {
    const pool = RECOVERY_SUGGESTIONS[issue]?.[lang] || [];
    for (const line of pool) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(line);
      if (picked.length >= MAX_SUGGESTIONS) return picked;
    }
  }

  return picked;
}

function buildRecoveryPromptBlock(issues = []) {
  if (!issues.length) return "";
  return [
    "Detected problems in the last turn (use these to craft recovery follow-ups):",
    ...issues.map((id) => `- ${id}`),
    "Suggest questions that help the user diagnose what went wrong and fix the quote/catalog/DOCX in this thread.",
    "At least one question should explicitly ask what failed; at least one should propose a concrete fix step.",
  ].join("\n");
}

module.exports = {
  detectUiLanguage,
  detectFollowUpIssues,
  buildRecoveryFollowUpSuggestions,
  buildRecoveryPromptBlock,
  wantsQuoteFlow,
  hasCatalogData,
  hasPriceSignals,
};
