"use strict";

/**
 * Map UI button / chip labels (RU/PL/EN) to draft chat command ids.
 * Exact normalized label match OR phrase patterns → same action as the button.
 */

function normalizeCommandText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    // Size separator only (М10×80 / М10х80) — do NOT turn «всех» into «всеx».
    .replace(/(\d)\s*[×х]\s*(\d)/giu, "$1x$2")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Curated labels from frontend locales (draftTable / quote / home chips).
 * Keep in sync when renaming buttons in offerKp i18n.
 */
const UI_DRAFT_COMMANDS = [
  {
    id: "cheapest_analogs",
    labels: [
      // draftTable.cheapestAnalogs
      "дешевые аналоги",
      "najtańsze analogi",
      "najtanze analogi",
      "cheapest analogs",
      // common operator paraphrases / titles
      "подставить дешевые аналоги",
      "выбрать дешевые аналоги",
      "применить дешевые аналоги",
      "подставь дешевые аналоги",
      "выбери дешевые аналоги",
      "вставь дешевые аналоги",
      "встав дешевые аналоги",
      "вставь для всех дешевые аналоги",
      "встав для всех дешевые аналоги",
      "вставь дешевые аналоги для всех",
      "встав дешевые аналоги для всех",
      "поставь дешевые аналоги для всех",
      "подставь дешевые аналоги для всех",
      "дешевые аналоги для всех",
      "дешевые аналоги по всем",
      "apply cheapest analogs",
      "apply cheapest analogs for all",
      "cheapest analogs for all",
      "podstaw najtańsze analogi",
      "podstaw najtanze analogi",
      "podstaw najtańsze analogi dla wszystkich",
      "podstaw najtanze analogi dla wszystkich",
    ],
    patterns: [
      // Bare button label
      /^(?:дешев\w*|cheapest|najta[nń]sze)\s+(?:аналог\w*|analog\w*)$/iu,
      // Verb + optional «для всех / for all» + cheapest analogs
      /(?:вставь?|подставь|поставь|примени|выбери|apply|podstaw)\w*.{0,60}(?:для\s+всех|по\s+всем|во\s+всех|на\s+все|for\s+all|dla\s+wszystk\w*)?.{0,40}(?:дешев\w*|cheapest|najta[nń]sz\w*).{0,25}(?:аналог\w*|analog\w*)/iu,
      // «дешёвые аналоги» + for-all (any order after the noun phrase)
      /(?:дешев\w*|cheapest|najta[nń]sze)\s+(?:аналог\w*|analog\w*).{0,40}(?:для\s+всех|по\s+всем|во\s+всех|for\s+all|dla\s+wszystk\w*|в\s+(?:кп|сводк|черновик|таблиц))/iu,
      // for-all first, then button name
      /(?:для\s+всех|по\s+всем|во\s+всех|for\s+all).{0,40}(?:дешев\w*|cheapest|najta[nń]sz\w*).{0,25}(?:аналог\w*|analog\w*)/iu,
    ],
  },
];

function matchUiDraftCommand(message = "") {
  const raw = String(message || "").trim();
  if (!raw) return null;
  const norm = normalizeCommandText(raw);
  if (!norm) return null;

  for (const cmd of UI_DRAFT_COMMANDS) {
    for (const label of cmd.labels) {
      if (norm === normalizeCommandText(label)) return cmd.id;
    }
    for (const re of cmd.patterns || []) {
      if (re.test(raw) || re.test(norm)) return cmd.id;
    }
  }
  return null;
}

function isUiDraftCommand(message = "") {
  return matchUiDraftCommand(message) != null;
}

module.exports = {
  normalizeCommandText,
  UI_DRAFT_COMMANDS,
  matchUiDraftCommand,
  isUiDraftCommand,
};
