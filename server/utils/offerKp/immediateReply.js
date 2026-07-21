"use strict";

const { OFFER_KP_INTENTS, routeOfferKpMessage } = require("./intentRouter");

function resolveOfferKpImmediateReply(message = "") {
  const text = String(message || "").trim();
  const routed = routeOfferKpMessage(text);
  const echo = text.match(/^(?:скажи|повтори|say)\s+(.{1,40}?)[!?.\s]*$/iu);
  if (echo && routed.primaryIntent === OFFER_KP_INTENTS.CASUAL_OR_TEST) {
    return echo[1].trim();
  }

  if (/^\d{1,4}$/u.test(text)) return text;

  if (routed.primaryIntent === OFFER_KP_INTENTS.OUT_OF_SCOPE) {
    if (/\b(?:weather|president|windows|poem|story)\b/iu.test(text)) {
      return "This chat handles product requests and commercial quotations from purolat.com. Please ask about a product, application, price, or quotation.";
    }
    return "Этот чат работает с товарами purolat.com, заявками и коммерческими предложениями. Уточните товар, позицию, цену или действие с КП.";
  }

  if (routed.primaryIntent !== OFFER_KP_INTENTS.CASUAL_OR_TEST) return null;

  if (/\bhow are you\b/iu.test(text)) {
    return "I'm doing well, thanks. How can I help with your request or quotation?";
  }
  if (/^(?:hello|hi)\b/iu.test(text)) {
    return "Hello! How can I help with your request or quotation?";
  }
  return "Здравствуйте! Чем могу помочь с заявкой или коммерческим предложением?";
}

module.exports = { resolveOfferKpImmediateReply };
