"use strict";

/**
 * Map UI button / chip labels (RU/PL/EN) to draft chat command ids.
 * Exact normalized label match OR phrase patterns → same action as the button.
 */

function normalizeCommandText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[×х]/giu, "x")
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
      "apply cheapest analogs",
      "podstaw najtańsze analogi",
      "podstaw najtanze analogi",
    ],
    patterns: [
      /^(?:дешев\w*|cheapest|najta[nń]sze)\s+(?:аналог|analog)/iu,
      /^(?:подставь|выбери|примени|поставь|apply|podstaw).{0,40}(?:дешев|cheapest|najta[nń]sz).{0,25}(?:аналог|analog)/iu,
      /(?:дешев\w*|cheapest|najta[nń]sze)\s+(?:аналог\w*|analog\w*)(?:\s+в\s+(?:кп|сводк|черновик|таблиц))?$/iu,
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
