/**
 * Форматирование блоков каталога для LLM (user message + system context).
 */

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

module.exports = {
  CATALOG_BLOCK_PREFIX,
  USER_CATALOG_HEADER,
  USER_CATALOG_FOOTER,
  isCatalogBlock,
  hasCatalogBlocks,
  mergeCatalogIntoUserPrompt,
};
