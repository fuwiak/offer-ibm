/**
 * Wykrywanie języka polskiego w treści wiadomości.
 *
 * Używane do przełączania źródła prawnego: dla języka polskiego korzystamy z
 * ELI API (api.sejm.gov.pl) zamiast z ГАРАНТ. Detekcja jest świadomie
 * konserwatywna — klasyfikujemy tekst jako polski tylko gdy mamy mocne sygnały
 * (polskie znaki diakrytyczne lub kilka polskich słów funkcyjnych) i brak
 * cyrylicy. Dzięki temu rosyjski/angielski nie są mylnie uznawane za polski.
 */

// Znaki charakterystyczne dla polskiego alfabetu.
const POLISH_DIACRITICS = /[ąćęłńóśźż]/i;

// Cyrylica → sygnał języka rosyjskiego (ГАРАНТ pozostaje domyślnym źródłem).
const CYRILLIC = /[\u0400-\u04FF]/;

// Częste polskie słowa funkcyjne / prawnicze (bez diakrytyków też się liczą).
const POLISH_STOPWORDS = new Set([
  "i",
  "w",
  "we",
  "z",
  "ze",
  "na",
  "do",
  "od",
  "po",
  "za",
  "o",
  "u",
  "oraz",
  "lub",
  "albo",
  "czy",
  "nie",
  "tak",
  "jest",
  "są",
  "sa",
  "być",
  "byc",
  "jak",
  "co",
  "to",
  "ten",
  "ta",
  "te",
  "który",
  "ktory",
  "która",
  "ktora",
  "które",
  "ktore",
  "dla",
  "przez",
  "przy",
  "pod",
  "nad",
  "się",
  "sie",
  "mnie",
  "mam",
  "moje",
  "proszę",
  "prosze",
  "ustawa",
  "ustawy",
  "ustawie",
  "ustawę",
  "ustawe",
  "prawo",
  "prawa",
  "prawie",
  "przepis",
  "przepisy",
  "przepisów",
  "przepisow",
  "artykuł",
  "artykul",
  "kodeks",
  "kodeksu",
  "rozporządzenie",
  "rozporzadzenie",
  "dziennik",
  "umowa",
  "umowy",
  "wyrok",
  "sąd",
  "sad",
  "sądu",
  "sadu",
  "podatek",
  "podatku",
  "pracy",
  "pracownik",
  "wynagrodzenie",
  "spółka",
  "spolka",
  "działalność",
  "dzialalnosc",
  "obowiązuje",
  "obowiazuje",
  "zgodnie",
  "według",
  "wedlug",
]);

/**
 * @param {string} text
 * @returns {{ isPolish: boolean, score: number, hasCyrillic: boolean, diacritics: boolean, stopwordHits: number }}
 */
function analyzePolish(text) {
  const result = {
    isPolish: false,
    score: 0,
    hasCyrillic: false,
    diacritics: false,
    stopwordHits: 0,
  };
  if (!text || typeof text !== "string") return result;

  const trimmed = text.trim();
  if (!trimmed) return result;

  result.hasCyrillic = CYRILLIC.test(trimmed);
  // Cyrylica wyklucza polski (preferujemy ГАРАНТ dla treści rosyjskich).
  if (result.hasCyrillic) return result;

  result.diacritics = POLISH_DIACRITICS.test(trimmed);

  const words = trimmed
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const w of words) {
    if (POLISH_STOPWORDS.has(w)) result.stopwordHits++;
  }

  // Heurystyka: polskie diakrytyki są bardzo silnym sygnałem; w przeciwnym razie
  // wymagamy co najmniej dwóch trafień słów funkcyjnych.
  result.score = (result.diacritics ? 3 : 0) + Math.min(result.stopwordHits, 5);
  result.isPolish = result.diacritics || result.stopwordHits >= 2;

  return result;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isPolishText(text) {
  return analyzePolish(text).isPolish;
}

module.exports = { analyzePolish, isPolishText, POLISH_DIACRITICS, CYRILLIC };
