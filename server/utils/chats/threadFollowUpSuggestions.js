"use strict";

const {
  writeResponseChunk,
  convertToPromptHistory,
} = require("../helpers/chat/responses");
const { getLLMProviderWithFallback } = require("../helpers");
const {
  detectFollowUpIssues,
  buildRecoveryFollowUpSuggestions,
  buildRecoveryPromptBlock,
} = require("./threadFollowUpRecovery");

const MAX_SUGGESTIONS = 3;
const MAX_QUESTION_CHARS = 140;

const FOLLOW_UP_SYSTEM_PROMPT = `You suggest short follow-up questions for a B2B sales / procurement chat assistant (OfferKP).
Given the latest user message and assistant reply (and brief prior context), propose exactly ${MAX_SUGGESTIONS} natural next questions the user might tap to continue the thread.
Rules:
- Same language as the user's latest message (Russian if they wrote in Russian, Polish if Polish, etc.).
- Each question is one concise sentence, max ${MAX_QUESTION_CHARS} characters.
- Questions must be actionable and specific to the conversation (catalog, quotes, analogs, stock, documents) — not generic "tell me more".
- If recovery notes mention missing catalog, empty DOCX template, or missing prices — suggest diagnostics ("what went wrong?") and concrete fixes ("rebuild quote from catalog").
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

function mergeFollowUpSuggestions(primary = [], secondary = []) {
  const seen = new Set();
  const merged = [];

  for (const list of [primary, secondary]) {
    for (const item of list || []) {
      const normalized = String(item || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!normalized || normalized.length > MAX_QUESTION_CHARS) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(normalized);
      if (merged.length >= MAX_SUGGESTIONS) return merged;
    }
  }

  return merged;
}

/**
 * Extract last user prompt + trailing assistant/agent text from aibitat chats.
 * @param {object[]} chats
 */
function extractAgentTurnForFollowUps(chats = []) {
  const list = Array.isArray(chats) ? chats : [];
  if (list.length < 2) return null;

  let idx = list.length - 1;
  const assistantParts = [];

  while (idx >= 0 && String(list[idx]?.from || "").toUpperCase() !== "USER") {
    const part = String(list[idx]?.content || "").trim();
    if (part) assistantParts.unshift(part);
    idx -= 1;
  }

  if (idx < 0) return null;

  const prompt = String(list[idx]?.content || "")
    .replace(/^@agent:\s*/i, "")
    .trim();
  const assistantText = assistantParts.join("\n").trim();
  if (!prompt || !assistantText) return null;

  const chatHistory = list.slice(0, idx).map((entry) => ({
    role:
      String(entry.from || "").toUpperCase() === "USER" ? "user" : "assistant",
    content: String(entry.content || ""),
  }));

  return { prompt, assistantText, chatHistory };
}

/**
 * @param {object} opts
 * @param {object} opts.workspace
 * @param {object|null} opts.user
 * @param {string} opts.prompt
 * @param {string} opts.assistantText
 * @param {object[]} [opts.chatHistory]
 * @param {string|null} [opts.language]
 * @param {boolean} [opts.catalogInjected]
 * @returns {Promise<{ suggestions: string[], variant: "recovery"|"continue", issues: string[] }>}
 */
async function generateThreadFollowUpSuggestions({
  workspace,
  user = null,
  prompt,
  assistantText,
  chatHistory = [],
  language = null,
  catalogInjected = false,
}) {
  if (!threadFollowUpSuggestionsEnabled()) {
    return { suggestions: [], variant: "continue", issues: [] };
  }
  if (!workspace?.slug) {
    return { suggestions: [], variant: "continue", issues: [] };
  }
  if (!String(prompt || "").trim() || !String(assistantText || "").trim()) {
    return { suggestions: [], variant: "continue", issues: [] };
  }

  const issues = detectFollowUpIssues({
    prompt,
    assistantText,
    catalogInjected,
  });
  const recovery = buildRecoveryFollowUpSuggestions({
    issues,
    prompt,
    language,
  });
  const variant = issues.length ? "recovery" : "continue";

  let llmSuggestions = [];
  try {
    const LLMConnector = await getLLMProviderWithFallback({
      provider: workspace?.chatProvider,
      model: workspace?.chatModel,
    });

    const historyBlock = trimHistoryForPrompt(chatHistory, 8);
    const recoveryBlock = buildRecoveryPromptBlock(issues);

    const userBlock = [
      historyBlock ? `Prior turns:\n${historyBlock}` : null,
      recoveryBlock || null,
      `Latest user message:\n${String(prompt).trim().slice(0, 1200)}`,
      `Latest assistant reply:\n${String(assistantText).trim().slice(0, 2000)}`,
      language ? `UI language hint: ${language}` : null,
      catalogInjected ? "Catalog blocks were injected for this turn." : null,
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

    llmSuggestions = parseSuggestionsFromLlmText(textResponse);
  } catch {
    llmSuggestions = [];
  }

  const suggestions = mergeFollowUpSuggestions(
    recovery.length ? recovery : llmSuggestions,
    recovery.length ? llmSuggestions : []
  );

  return { suggestions, variant, issues };
}

/**
 * Generates follow-up questions and streams them after finalize (non-blocking UX).
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
  catalogInjected = false,
}) {
  if (!thread?.id || !response) return [];

  const { suggestions, variant } = await generateThreadFollowUpSuggestions({
    workspace,
    user,
    prompt,
    assistantText,
    chatHistory,
    language,
    catalogInjected,
  });

  if (!suggestions.length) return [];

  writeResponseChunk(response, {
    uuid,
    type: "threadFollowUpSuggestions",
    suggestions,
    variant,
    close: false,
    error: false,
  });

  return suggestions;
}

module.exports = {
  threadFollowUpSuggestionsEnabled,
  parseSuggestionsFromLlmText,
  mergeFollowUpSuggestions,
  extractAgentTurnForFollowUps,
  generateThreadFollowUpSuggestions,
  emitThreadFollowUpSuggestions,
  MAX_SUGGESTIONS,
};
