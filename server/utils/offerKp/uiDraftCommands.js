"use strict";

/**
 * Map natural-language chat → draft UI command ids.
 *
 * Design: slot matching, not an endless phrase whitelist.
 * A command fires when required semantic slots co-occur; optional
 * action / scope slots raise confidence. Catalog search questions
 * («найди дешёвые аналоги DIN 933») are rejected so ShopDB search
 * still owns those.
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

const CHEAP_SLOT =
  /(?:дешев|наименьш\w*\s+цен|самой?\s+низк\w*\s+цен|cheapest|lowest\s+price|lower\s+price|najta[nń]sz|taniejsz|najni[zż]sz\w*\s+cen)/iu;

const ANALOG_SLOT =
  /(?:аналог|analog|zamiennik|alternativ|заменител)/iu;

const APPLY_SLOT =
  /(?:вставь?|подставь|поставь|примени|выбери|сделай|замени|поменяй|обнови|возьми|бери|проставь|подтяни|apply|use|set|pick|choose|podstaw|zamie[nń]|u[zż]yj|wybierz)/iu;

const SCOPE_ALL_SLOT =
  /(?:для\s+всех|по\s+всем|во\s+всех|на\s+все|всем\s+строк|все\s+позиц|всех\s+позиц|for\s+all|all\s+rows|all\s+lines|dla\s+wszystk|we\s+wszystk|w\s+(?:кп|сводк|черновик|таблиц|kp|ofercie|draft))/iu;

const CATALOG_SEARCH_SLOT =
  /(?:найди|подбери|ищу|поищи|есть\s+ли|что\s+есть|сравни|search|find|look\s+up|compare|szukaj|znajd[zź]|por[oó]wnaj)/iu;

const PRODUCT_QUERY_SLOT =
  /(?:^|[^\p{L}\p{N}])(?:din|гост|gost|iso|болт|гайк|шайб|винт|шпильк|м\s*\d|m\s*\d)/iu;

const QUESTION_SLOT =
  /(?:^(?:какой|какая|какие|сколько|есть\s+ли|можно\s+ли|что\s+за|what|which|how|czy|ile|jakie)(?:$|[^\p{L}\p{N}])|\?\s*$)/iu;

/**
 * Each command: optional exact i18n labels + matchSlots(norm, raw) for NL.
 */
const UI_DRAFT_COMMANDS = [
  {
    id: "cheapest_analogs",
    labels: [
      "дешевые аналоги",
      "najtańsze analogi",
      "najtanze analogi",
      "cheapest analogs",
    ],
    matchSlots(norm) {
      // Required: cheap + analog somewhere in the utterance.
      if (!CHEAP_SLOT.test(norm) || !ANALOG_SLOT.test(norm)) return false;

      // Leave catalog questions alone («найди дешёвые аналоги DIN 933»).
      if (CATALOG_SEARCH_SLOT.test(norm) && PRODUCT_QUERY_SLOT.test(norm)) {
        return false;
      }
      // Pure Q without apply/scope («какие дешёвые аналоги есть?»).
      if (
        QUESTION_SLOT.test(norm) &&
        !APPLY_SLOT.test(norm) &&
        !SCOPE_ALL_SLOT.test(norm)
      ) {
        return false;
      }

      const words = norm.split(/\s+/).filter(Boolean);
      // Short button-like: «дешёвые аналоги», «встав дешёвые аналоги».
      if (words.length <= 8) return true;
      // Explicit apply or «for all / in KP» → draft command regardless of length.
      if (APPLY_SLOT.test(norm) || SCOPE_ALL_SLOT.test(norm)) return true;
      return false;
    },
  },
];

function matchUiDraftCommand(message = "") {
  const raw = String(message || "").trim();
  if (!raw) return null;
  const norm = normalizeCommandText(raw);
  if (!norm) return null;

  for (const cmd of UI_DRAFT_COMMANDS) {
    for (const label of cmd.labels || []) {
      if (norm === normalizeCommandText(label)) return cmd.id;
    }
    if (typeof cmd.matchSlots === "function" && cmd.matchSlots(norm, raw)) {
      return cmd.id;
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
  CHEAP_SLOT,
  ANALOG_SLOT,
  APPLY_SLOT,
  SCOPE_ALL_SLOT,
};
