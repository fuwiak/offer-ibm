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
    finalUserPrompt = mergeCatalogIntoUserPrompt(finalUserPrompt, catalogBlocks);
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

  let chatHistory = options.chatHistory || null;
  if (!chatHistory?.length && options.workspace?.id) {
    chatHistory = await loadChatHistoryForShopEnrich({
      workspace: options.workspace,
      userId: options.userId ?? null,
      threadId: options.threadId ?? null,
    });
  }

  try {
    const r = await getShopDbContext(trimmed, {
      maxDocs: options.maxDocs || 5,
      chatHistory,
      workspace: options.workspace || null,
    });
    const blocks = (r?.contextTexts || []).filter(isCatalogBlock);
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
  mergeCatalogIntoUserPrompt,
  applyExternalContextsForLlm,
  enrichUserPromptWithShopCatalog,
  loadChatHistoryForShopEnrich,
};
