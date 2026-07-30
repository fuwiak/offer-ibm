"use strict";

const { OFFER_KP_INTENTS } = require("./intentRouter");

/**
 * ShopDB matching / draft / data plans do not need a live chat LLM.
 * Fail-fast only for prompts that have nothing useful without generation.
 */
function shouldContinueWithoutChatLlm(
  routedIntent = {},
  quoteDocumentRequest = false
) {
  if (quoteDocumentRequest) return true;
  if (routedIntent?.policy?.allowShopDbSearch) return true;
  const primary = routedIntent?.primaryIntent;
  return [
    OFFER_KP_INTENTS.CREATE_QUOTE,
    OFFER_KP_INTENTS.PRODUCT_INQUIRY,
    OFFER_KP_INTENTS.PRODUCT_SEARCH,
    OFFER_KP_INTENTS.EDIT_QUOTE,
    OFFER_KP_INTENTS.DATA_QUESTION,
  ].includes(primary);
}

function buildLlmDownChatReply({ draft = null, requestId = "" } = {}) {
  const n = Array.isArray(draft?.lines) ? draft.lines.length : 0;
  const rid = requestId ? ` requestId=${requestId}` : "";
  if (n > 0) {
    return (
      `Сводка позиций готова: ${n} строк. Откройте вкладку «Сводка позиций».\n` +
      `Текстовый ответ модели недоступен — LM Studio на lainey не отвечает (:1234).` +
      rid
    );
  }
  return (
    "LM Studio на lainey недоступен (пустое соединение :1234). " +
    "Чат не может генерировать ответ, пока модель не загружена в LM Studio." +
    rid
  );
}

module.exports = {
  shouldContinueWithoutChatLlm,
  buildLlmDownChatReply,
};
