"use strict";

const { OFFER_KP_INTENTS, routeOfferKpMessage } = require("./intentRouter");

function resolveOfferKpImmediateReply(message = "") {
  const text = String(message || "").trim();
  const routed = routeOfferKpMessage(text);
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
