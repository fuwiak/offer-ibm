"use strict";

/**
 * Map exact UI button/chip labels → draft command ids.
 *
 * Free-form language is deliberately not parsed here. It is classified by
 * chatCommandLlm into the same closed command set, then executed by the
 * deterministic draftChatEdit dispatcher.
 */

function normalizeCommandText(value = "") {
  return (
    String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      // Size separator only (М10×80 / М10х80) — do NOT turn «всех» into «всеx».
      .replace(/(\d)\s*[×х]\s*(\d)/giu, "$1x$2")
      .replace(/[^\p{L}\p{N}.]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

const UI_DRAFT_COMMANDS = [
  {
    id: "cheapest_analogs",
    labels: [
      "дешевые аналоги",
      "najtańsze analogi",
      "najtanze analogi",
      "cheapest analogs",
    ],
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
