/**
 * Форматирование блоков каталога для LLM (user message + system context).
 */

const shopDbLog = require("./shopDbLog");

const CATALOG_BLOCK_PREFIX = "[Каталог ·";
const USER_CATALOG_HEADER = "=== ДАННЫЕ КАТАЛОГА PUROLAT.COM (MySQL) ===";
const USER_CATALOG_FOOTER = "=== КОНЕЦ ДАННЫХ КАТАЛОГА ===";

function isCatalogBlock(text) {
  return String(text || "").includes(CATALOG_BLOCK_PREFIX);
}

function hasCatalogBlocks(contextTexts = []) {
  return (contextTexts || []).some(isCatalogBlock);
}

function historyEntryText(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return String(
    entry.content || entry.userPrompt || entry.text || entry.message || ""
  ).trim();
}

/**
 * Извлекает блоки [Каталог · …] из текста (в т.ч. из секции ДАННЫЕ КАТАЛОГА).
 */
function extractCatalogBlocksFromText(text = "") {
  const raw = String(text || "");
  if (!raw.trim()) return [];

  const blocks = [];
  const seen = new Set();

  function pushBlock(block) {
    const trimmed = String(block || "").trim();
    if (!trimmed || !isCatalogBlock(trimmed)) return;
    const key = trimmed.slice(0, 240);
    if (seen.has(key)) return;
    seen.add(key);
    blocks.push(trimmed);
  }

  const sectionRe =
    /===\s*ДАННЫЕ КАТАЛОГА[\s\S]*?===\s*\n([\s\S]*?)\n===\s*КОНЕЦ ДАННЫХ КАТАЛОГА\s*===/gi;
  for (const match of raw.matchAll(sectionRe)) {
    const section = String(match[1] || "").trim();
    if (!section) continue;
    for (const part of section.split(/\n{2,}/)) {
      pushBlock(part);
    }
  }

  for (const match of raw.matchAll(/\[Каталог\s*·[\s\S]*?(?=\n{2,}\[Каталог\s*·|\n===|$)/gi)) {
    pushBlock(match[0]);
  }

  return blocks;
}

function extractCatalogBlocksFromChatHistory(chatHistory = [], limit = 12) {
  const list = Array.isArray(chatHistory) ? chatHistory : [];
  const blocks = [];
  const seen = new Set();

  for (let i = list.length - 1; i >= 0 && blocks.length < limit; i--) {
    for (const block of extractCatalogBlocksFromText(historyEntryText(list[i]))) {
      const key = block.slice(0, 240);
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push(block);
      if (blocks.length >= limit) break;
    }
  }

  return blocks.reverse();
}

async function loadParsedFileTextsForThread({
  workspace = null,
  threadId = null,
  userId = null,
} = {}) {
  if (!workspace?.id) return [];
  const { WorkspaceParsedFiles } = require("../../models/workspaceParsedFiles");
  const files = await WorkspaceParsedFiles.getContextFiles(
    workspace,
    threadId ? { id: threadId } : null,
    userId ? { id: userId } : null
  );
  return (files || []).map((doc) => doc.pageContent).filter(Boolean);
}

/**
 * Дублирует блоки [Каталог · …] в начало user prompt — модели надёжнее читают цены отсюда,
 * чем из system Context:[CONTEXT N].
 */
function mergeCatalogIntoUserPrompt(userPrompt, contextTexts = []) {
  const blocks = (contextTexts || []).filter(isCatalogBlock);
  if (!blocks.length) return String(userPrompt || "").trim();

  const catalogSection = blocks.join("\n\n");
  const question = String(userPrompt || "").trim();
  return `${USER_CATALOG_HEADER}\n${catalogSection}\n${USER_CATALOG_FOOTER}\n\n${question}`;
}

/**
 * Каталог → user prompt (единственное место для цен).
 * Прочие external context → system contextTexts.
 */
function applyExternalContextsForLlm(userPrompt, externalContexts = []) {
  const systemContextTexts = [];
  const sources = [];
  let catalogBlocks = [];
  let shopDbFlags = null;

  for (const ext of externalContexts || []) {
    const texts = ext?.contextTexts || [];
    if (ext?.kind === "shopdb") {
      shopDbFlags = ext?.flags || null;
      catalogBlocks = texts.filter(isCatalogBlock);
      for (const t of texts) {
        if (!isCatalogBlock(t)) systemContextTexts.push(t);
      }
    } else {
      systemContextTexts.push(...texts);
    }
    if (Array.isArray(ext?.sources)) sources.push(...ext.sources);
  }

  let finalUserPrompt = String(userPrompt || "").trim();
  const catalogInjected = catalogBlocks.length > 0;
  if (catalogInjected) {
    finalUserPrompt = mergeCatalogIntoUserPrompt(
      finalUserPrompt,
      catalogBlocks
    );
    shopDbLog.ok("catalog injected into user prompt", {
      blocks: catalogBlocks.length,
      userPromptLen: finalUserPrompt.length,
    });
  } else if (shopDbFlags && !shopDbFlags.shopDbSkipped) {
    shopDbLog.warn("catalog not injected", {
      shopDbDocCount: shopDbFlags.shopDbDocCount ?? 0,
      shopDbTimeout: !!shopDbFlags.shopDbTimeout,
      shopDbError: !!shopDbFlags.shopDbError,
      shopDbMessage: shopDbFlags.shopDbMessage || undefined,
      target: shopDbFlags.shopDbTarget || undefined,
    });
  }

  return {
    userPrompt: finalUserPrompt,
    contextTexts: systemContextTexts,
    sources,
    shopDbFlags,
    catalogInjected,
    catalogBlocks,
  };
}

async function loadChatHistoryForShopEnrich({
  workspace = null,
  userId = null,
  threadId = null,
  messageLimit = 10,
} = {}) {
  if (!workspace?.id) return [];
  const { recentChatHistory } = require("../chats/index");
  const { chatHistory } = await recentChatHistory({
    user: userId ? { id: userId } : null,
    workspace,
    thread: threadId ? { id: threadId } : null,
    messageLimit,
  });
  return chatHistory || [];
}

/**
 * Подставляет блоки каталога в текст сообщения (чат и агент).
 * @param {string} message
 * @param {{ chatHistory?: object[], workspace?: object, userId?: number, threadId?: number, maxDocs?: number }} [options]
 * @returns {Promise<string>}
 */
async function enrichUserPromptWithShopCatalog(message, options = {}) {
  const { shopDbEnrichEnabled, getShopDbContext } = require("./enrich");
  const trimmed = String(message || "").trim();
  if (!shopDbEnrichEnabled() || !trimmed) {
    return trimmed;
  }

  const maxDocs = options.maxDocs || (options.agentMode ? 5 : 5);

  let parsedFileTexts = (options.parsedFileTexts || []).filter(Boolean);
  if (!parsedFileTexts.length && options.workspace?.id) {
    parsedFileTexts = await loadParsedFileTextsForThread({
      workspace: options.workspace,
      threadId: options.threadId ?? null,
      userId: options.userId ?? null,
    });
  }

  let chatHistory = options.chatHistory || null;
  if (!chatHistory?.length && options.workspace?.id) {
    chatHistory = await loadChatHistoryForShopEnrich({
      workspace: options.workspace,
      userId: options.userId ?? null,
      threadId: options.threadId ?? null,
    });
  }

  const historyCatalogBlocks = extractCatalogBlocksFromChatHistory(chatHistory);

  try {
    const r = await getShopDbContext(trimmed, {
      maxDocs,
      chatHistory,
      workspace: options.workspace || null,
      parsedFileTexts,
    });
    let blocks = (r?.contextTexts || []).filter(isCatalogBlock);
    if (!blocks.length && historyCatalogBlocks.length) {
      blocks = historyCatalogBlocks;
      shopDbLog.ok("catalog reused from chat history", {
        blocks: blocks.length,
      });
    }
    if (options.agentMode && blocks.length > maxDocs) {
      blocks = blocks.slice(-maxDocs);
    }
    if (!blocks.length) {
      if (r?.flags?.shopDbError || r?.flags?.shopDbTimeout) {
        shopDbLog.warn("agent/chat catalog not injected", {
          shopDbError: !!r?.flags?.shopDbError,
          shopDbTimeout: !!r?.flags?.shopDbTimeout,
          shopDbMessage: r?.flags?.shopDbMessage || undefined,
        });
      }
      return trimmed;
    }
    return mergeCatalogIntoUserPrompt(trimmed, blocks);
  } catch (e) {
    shopDbLog.enrichError(e, { phase: "enrichUserPromptWithShopCatalog" });
    return trimmed;
  }
}

module.exports = {
  CATALOG_BLOCK_PREFIX,
  USER_CATALOG_HEADER,
  USER_CATALOG_FOOTER,
  isCatalogBlock,
  hasCatalogBlocks,
  historyEntryText,
  extractCatalogBlocksFromText,
  extractCatalogBlocksFromChatHistory,
  loadParsedFileTextsForThread,
  mergeCatalogIntoUserPrompt,
  applyExternalContextsForLlm,
  enrichUserPromptWithShopCatalog,
  loadChatHistoryForShopEnrich,
};
