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
- Suggest only actions supported by OfferKP: product/catalog search with a concrete product from context, create/update quote, read current quote total/count/summary, or supported draft edits.
- Never suggest external/web/Yandex facts. External suggestions require a separate source-labelled execution path and are disabled here.
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

function followUpLanguage(prompt = "", hint = null) {
  const normalizedHint = String(hint || "").toLowerCase();
  if (normalizedHint.startsWith("ru")) return "ru";
  if (normalizedHint.startsWith("pl")) return "pl";
  if (normalizedHint.startsWith("en")) return "en";
  const text = String(prompt || "");
  if (/[а-яё]/iu.test(text)) return "ru";
  if (/[ąćęłńóśźż]|\b(?:jaka|ile|ofert|pozycj|suma)\b/iu.test(text))
    return "pl";
  return "en";
}

function buildDraftFollowUpSuggestions({
  quoteDraft = null,
  prompt = "",
  language = null,
} = {}) {
  const lines = quoteDraft?.hardwareLines || quoteDraft?.preview?.lines || [];
  if (!Array.isArray(lines) || !lines.length) return [];

  const lang = followUpLanguage(prompt, language);
  const hasUsableAlternatives = lines.some((line) =>
    (line?.alternatives || []).some((alt) => {
      const price = Number(alt?.price ?? alt?.unitPriceNet);
      const stock = Number(alt?.stockCount ?? alt?.count ?? alt?.stock);
      return Number.isFinite(price) && price > 0 && stock > 0;
    })
  );
  const pools = {
    ru: {
      total: "Какова общая сумма заказа по текущему списку?",
      count: "Сколько позиций сейчас в текущем списке?",
      summary: "Покажи краткий итог текущего списка: позиции и общую сумму",
      cheapest: "Подставь самые дешёвые доступные аналоги в текущую сводку",
    },
    pl: {
      total: "Jaka jest łączna suma bieżącej listy?",
      count: "Ile pozycji znajduje się teraz na bieżącej liście?",
      summary: "Pokaż krótkie podsumowanie bieżącej listy: pozycje i sumę",
      cheapest: "Zastosuj najtańsze dostępne zamienniki w bieżącym zestawieniu",
    },
    en: {
      total: "What is the total for the current item list?",
      count: "How many items are currently in the list?",
      summary: "Show a short summary of the current list: items and total",
      cheapest:
        "Apply the cheapest available alternatives to the current draft",
    },
  };
  const labels = pools[lang];
  const latest = String(prompt || "").toLowerCase();
  const ordered = /сумм|total|suma/iu.test(latest)
    ? [labels.summary, labels.count]
    : [labels.total, labels.summary, labels.count];
  if (hasUsableAlternatives) ordered.unshift(labels.cheapest);
  return mergeFollowUpSuggestions(ordered, []);
}

/**
 * Clip filename for chip labels (same rules as frontend shortFilename).
 * @param {string} [name]
 * @param {number} [max]
 */
function shortFollowUpFilename(name = "", max = 28) {
  const raw = String(name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!raw) return "";
  if (raw.length <= max) return raw;
  const extMatch = raw.match(/(\.[a-z0-9]{1,8})$/i);
  const ext = extMatch ? extMatch[1] : "";
  const base = ext ? raw.slice(0, -ext.length) : raw;
  const keep = Math.max(8, max - ext.length - 1);
  return `${base.slice(0, keep)}…${ext}`;
}

/**
 * Deterministic starters after file upload / when OCR is in thread context.
 * Keep wording compatible with intentRouter START_QUOTE_PROMPTS / create_quote.
 */
function buildUploadStarterFollowUps({
  language = null,
  prompt = "",
  hasParsedFiles = false,
  filename = "",
} = {}) {
  if (!hasParsedFiles) return [];
  const lang = followUpLanguage(prompt, language);
  const clipped = shortFollowUpFilename(filename);

  const pools = {
    ru: clipped
      ? [
          `Сформировать КП по ${clipped}`,
          "Покажи текст заявки из загруженного файла",
          "Покажи сводку позиций из загруженного файла",
        ]
      : [
          "Сделай КП по прикреплённой заявке",
          "Покажи сводку позиций из загруженного файла",
          "Найди аналоги для позиций без наличия",
        ],
    pl: clipped
      ? [
          `Utwórz ofertę KP z ${clipped}`,
          "Pokaż tekst zapytania z wgranego pliku",
          "Pokaż zestawienie pozycji z wgranego pliku",
        ]
      : [
          "Zrób ofertę KP z załączonego zapytania",
          "Pokaż zestawienie pozycji z wgranego pliku",
          "Znajdź zamienniki dla pozycji bez stanu",
        ],
    en: clipped
      ? [
          `Build a quote from ${clipped}`,
          "Show the inquiry text from the uploaded file",
          "Show the line summary from the uploaded file",
        ]
      : [
          "Build a quote from the attached inquiry",
          "Show the line summary from the uploaded file",
          "Find analogs for out-of-stock lines",
        ],
  };
  return mergeFollowUpSuggestions(pools[lang] || pools.ru, []);
}

/**
 * After PDF/DOCX КП artifacts — executable draft/catalog follow-ups only
 * (panel open/download is handled by frontend contextActions).
 */
function buildQuoteOutputFollowUps({
  language = null,
  prompt = "",
  quoteOutputs = [],
  assistantText = "",
} = {}) {
  const outputs = Array.isArray(quoteOutputs) ? quoteOutputs : [];
  const hasPdf = outputs.some(
    (o) =>
      o?.type === "PdfFileDownload" ||
      String(o?.payload?.filename || "")
        .toLowerCase()
        .endsWith(".pdf")
  );
  const hasDocx = outputs.some(
    (o) =>
      o?.type === "DocxFileDownload" ||
      /\.docx?$/i.test(String(o?.payload?.filename || ""))
  );
  const text = String(assistantText || "");
  const textHasQuoteFiles =
    /коммерческ(?:ое|ого)\s+предложен/iu.test(text) ||
    (/\bPDF\b/i.test(text) && /(?:создан|готов|файл)/iu.test(text)) ||
    (/\bDOCX?\b/i.test(text) && /(?:создан|готов|файл|Word)/iu.test(text));
  if (!hasPdf && !hasDocx && !textHasQuoteFiles) return [];

  const lang = followUpLanguage(prompt, language);
  const pools = {
    ru: [
      "Покажи краткий итог текущего списка: позиции и общую сумму",
      "Найди аналоги для позиций без наличия",
      "Пересобери КП в PDF/DOCX с актуальными ценами из каталога",
    ],
    pl: [
      "Pokaż krótkie podsumowanie bieżącej listy: pozycje i sumę",
      "Znajdź zamienniki dla pozycji bez stanu",
      "Przebuduj ofertę KP w PDF/DOCX z aktualnymi cenami z katalogu",
    ],
    en: [
      "Show a short summary of the current list: items and total",
      "Find analogs for out-of-stock lines",
      "Rebuild the quote PDF/DOCX with current catalog prices",
    ],
  };
  return mergeFollowUpSuggestions(pools[lang] || pools.ru, []);
}

function summarizeQuoteDraftForPrompt(quoteDraft = null) {
  const lines = quoteDraft?.hardwareLines || quoteDraft?.preview?.lines || [];
  if (!Array.isArray(lines) || !lines.length) return null;
  const priced = lines.filter(
    (l) => Number(l?.unitPriceNet || l?.unitPrice) > 0
  ).length;
  const needsReview = lines.filter((l) => l?.needsReview).length;
  return `Quote draft: ${lines.length} lines, ${priced} priced, ${needsReview} needs_review.`;
}

function summarizeParsedFilesForPrompt(parsedFileTexts = []) {
  const texts = (parsedFileTexts || []).filter(Boolean);
  if (!texts.length) return null;
  const preview = texts
    .map((t) => String(t).replace(/\s+/g, " ").trim().slice(0, 280))
    .filter(Boolean)
    .join(" | ");
  return `Attached inquiry text (${texts.length} file(s)): ${preview}`;
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
 * @param {object|null} [opts.quoteDraft]
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
  quoteDraft = null,
  parsedFileTexts = [],
  parsedFileNames = [],
  quoteOutputs = [],
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
  const draftSuggestions = buildDraftFollowUpSuggestions({
    quoteDraft,
    prompt,
    language,
  });
  const uploadFilename =
    (Array.isArray(parsedFileNames) && parsedFileNames.find(Boolean)) || "";
  const hasParsedFiles =
    (parsedFileTexts || []).some((t) => String(t || "").trim()) ||
    (parsedFileNames || []).some((n) => String(n || "").trim());
  const uploadStarters = buildUploadStarterFollowUps({
    language,
    prompt,
    hasParsedFiles,
    filename: uploadFilename,
  });
  const quoteFileSuggestions = buildQuoteOutputFollowUps({
    language,
    prompt,
    quoteOutputs,
    assistantText,
  });
  // Prefer recovery → draft → freshly generated КП → upload starters.
  const deterministic = mergeFollowUpSuggestions(
    recovery.length
      ? recovery
      : draftSuggestions.length
        ? draftSuggestions
        : quoteFileSuggestions,
    mergeFollowUpSuggestions(
      draftSuggestions,
      mergeFollowUpSuggestions(quoteFileSuggestions, uploadStarters)
    )
  );

  let llmSuggestions = [];
  let allowLlm = true;
  let resolveOfferKpChatSampling = null;
  try {
    const sampling = require("../offerKp/deterministicSampling");
    resolveOfferKpChatSampling = sampling.resolveOfferKpChatSampling;
    if (sampling.offerKpStrictDeterminismEnabled()) allowLlm = false;
  } catch {
    allowLlm = true;
  }

  if (allowLlm) {
    try {
      const LLMConnector = await getLLMProviderWithFallback({
        provider: workspace?.chatProvider,
        model: workspace?.chatModel,
      });

      const historyBlock = trimHistoryForPrompt(chatHistory, 8);
      const recoveryBlock = buildRecoveryPromptBlock(issues);
      const draftBlock = summarizeQuoteDraftForPrompt(quoteDraft);
      const filesBlock = summarizeParsedFilesForPrompt(parsedFileTexts);

      const userBlock = [
        historyBlock ? `Prior turns:\n${historyBlock}` : null,
        filesBlock || null,
        draftBlock || null,
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

      const samplingOpts = resolveOfferKpChatSampling
        ? resolveOfferKpChatSampling({ temperature: 0.2 })
        : { temperature: 0.2 };
      const { textResponse } = await LLMConnector.getChatCompletion(messages, {
        ...samplingOpts,
        user,
      });

      llmSuggestions = parseSuggestionsFromLlmText(textResponse);
    } catch {
      llmSuggestions = [];
    }
  }

  const suggestions = mergeFollowUpSuggestions(
    recovery.length ? recovery : llmSuggestions,
    mergeFollowUpSuggestions(
      recovery.length ? llmSuggestions : deterministic,
      deterministic
    )
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
  quoteDraft = null,
  parsedFileTexts = [],
  parsedFileNames = [],
  quoteOutputs = [],
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
    quoteDraft,
    parsedFileTexts,
    parsedFileNames,
    quoteOutputs,
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
  shortFollowUpFilename,
  buildDraftFollowUpSuggestions,
  buildUploadStarterFollowUps,
  buildQuoteOutputFollowUps,
  generateThreadFollowUpSuggestions,
  emitThreadFollowUpSuggestions,
  MAX_SUGGESTIONS,
};
