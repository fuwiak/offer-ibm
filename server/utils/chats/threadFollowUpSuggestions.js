"use strict";

const {
  writeResponseChunk,
  convertToPromptHistory,
} = require("../helpers/chat/responses");
const { getLLMProviderWithFallback } = require("../helpers");

const MAX_SUGGESTIONS = 3;
const MAX_QUESTION_CHARS = 140;

const FOLLOW_UP_SYSTEM_PROMPT = `You suggest short follow-up questions for a B2B sales / procurement chat assistant (OfferKP).
Given the latest user message and assistant reply (and brief prior context), propose exactly ${MAX_SUGGESTIONS} natural next questions the user might tap to continue the thread.
Rules:
- Same language as the user's latest message (Russian if they wrote in Russian, etc.).
- Each question is one concise sentence, max ${MAX_QUESTION_CHARS} characters.
- Questions must be actionable and specific to the conversation (catalog, quotes, analogs, stock, documents) — not generic "tell me more".
- Do not repeat the user's last question verbatim.
- Return ONLY a JSON array of ${MAX_SUGGESTIONS} strings. No markdown, no commentary.`;

function threadFollowUpSuggestionsEnabled() {
  return (
    String(process.env.THREAD_FOLLOW_UP_SUGGESTIONS_DISABLED || "")
      .trim()
      .toLowerCase() !== "true"
  );
}

function normalizeChatHistory(chatHistory = []) {
  if (!Array.isArray(chatHistory) || chatHistory.length === 0) return [];
  if (chatHistory[0]?.prompt !== undefined) {
    return convertToPromptHistory(chatHistory);
  }
  return chatHistory;
}
function trimHistoryForPrompt(history = [], limit = 6) {
  const normalized = normalizeChatHistory(history);
  return normalized
    .slice(-limit)
    .map((entry) => {
      const role = entry?.role === "assistant" ? "assistant" : "user";
      const text = String(entry?.content || entry?.prompt || "").trim();
      if (!text) return null;
      return `${role}: ${text.slice(0, 800)}`;
    })
    .filter(Boolean)
    .join("\n");
}

function parseSuggestionsFromLlmText(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return [];

  const tryJson = (candidate) => {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    } catch {
      return [];
    }
  };

  let items = tryJson(text);
  if (!items.length) {
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) items = tryJson(arrayMatch[0]);
  }

  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const normalized = item.replace(/\s+/g, " ").trim();
    if (!normalized || normalized.length > MAX_QUESTION_CHARS) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
    if (unique.length >= MAX_SUGGESTIONS) break;
  }
  return unique;
}

/**
 * @param {object} opts
 * @param {object} opts.workspace
 * @param {object|null} opts.user
 * @param {string} opts.prompt
 * @param {string} opts.assistantText
 * @param {object[]} [opts.chatHistory]
 * @param {string|null} [opts.language]
 * @returns {Promise<string[]>}
 */
async function generateThreadFollowUpSuggestions({
  workspace,
  user = null,
  prompt,
  assistantText,
  chatHistory = [],
  language = null,
}) {
  if (!threadFollowUpSuggestionsEnabled()) return [];
  if (!workspace?.slug) return [];
  if (!String(prompt || "").trim() || !String(assistantText || "").trim()) {
    return [];
  }

  const LLMConnector = await getLLMProviderWithFallback({
    provider: workspace?.chatProvider,
    model: workspace?.chatModel,
  });

  const historyBlock = trimHistoryForPrompt(chatHistory, 8);

  const userBlock = [
    historyBlock ? `Prior turns:\n${historyBlock}` : null,
    `Latest user message:\n${String(prompt).trim().slice(0, 1200)}`,
    `Latest assistant reply:\n${String(assistantText).trim().slice(0, 2000)}`,
    language ? `UI language hint: ${language}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages = [
    { role: "system", content: FOLLOW_UP_SYSTEM_PROMPT },
    { role: "user", content: userBlock },
  ];

  const { textResponse } = await LLMConnector.getChatCompletion(messages, {
    temperature: 0.4,
    user,
  });

  return parseSuggestionsFromLlmText(textResponse);
}

/**
 * Generates follow-up questions and streams them to the client before finalize.
 */
async function emitThreadFollowUpSuggestions({
  response,
  uuid,
  workspace,
  user = null,
  thread = null,
  prompt,
  assistantText,
  chatHistory = [],
  language = null,
}) {
  if (!thread?.id || !response) return [];

  const suggestions = await generateThreadFollowUpSuggestions({
    workspace,
    user,
    prompt,
    assistantText,
    chatHistory,
    language,
  });

  if (!suggestions.length) return [];

  writeResponseChunk(response, {
    uuid,
    type: "threadFollowUpSuggestions",
    suggestions,
    close: false,
    error: false,
  });

  return suggestions;
}

module.exports = {
  threadFollowUpSuggestionsEnabled,
  parseSuggestionsFromLlmText,
  generateThreadFollowUpSuggestions,
  emitThreadFollowUpSuggestions,
  MAX_SUGGESTIONS,
};
