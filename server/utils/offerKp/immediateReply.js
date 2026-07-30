"use strict";

const { OFFER_KP_INTENTS, routeOfferKpMessage } = require("./intentRouter");

const SYSTEM_HELP_REPLY_RU = `Я помогаю с заявками на крепёж и коммерческими предложениями по каталогу purolat.com (ShopDB).

Что умею:
• разобрать текст, PDF или фото заявки (OCR) и извлечь позиции;
• найти товары в каталоге (DIN/ГОСТ, размер, SKU) и подобрать аналоги;
• собрать сводку позиций с ценами только из базы (цены не выдумываю);
• править черновик КП и экспортировать PDF / DOCX / XLSX.

Напишите позицию (например «болт DIN 933 M10×80 200 шт») или прикрепите заявку.`;

const SYSTEM_HELP_REPLY_EN = `I help with fastener RFQs and commercial quotes against the purolat.com catalog (ShopDB).

I can:
• parse text, PDF or photo of an inquiry (OCR) and extract line items;
• search the catalog (DIN/GOST, size, SKU) and suggest analogs;
• build a draft quote with prices only from the database (no invented prices);
• edit the draft and export PDF / DOCX / XLSX.

Send a line item (e.g. "bolt DIN 933 M10x80 200 pcs") or attach an inquiry file.`;

const SYSTEM_HELP_REPLY_PL = `Pomagam z zapytaniami o łączniki i ofertami handlowymi z katalogu purolat.com (ShopDB).

Umiejętności:
• odczyt tekstu, PDF lub zdjęcia zapytania (OCR) i wyciągnięcie pozycji;
• wyszukiwanie w katalogu (DIN/GOST, rozmiar, SKU) i dobór analogów;
• budowa zestawienia z cenami tylko z bazy (bez wymyślonych cen);
• edycja szkicu oferty i eksport PDF / DOCX / XLSX.

Napisz pozycję (np. „śruba DIN 933 M10x80 200 szt”) lub dołącz plik zapytania.`;

function looksPolish(text = "") {
  return /[ąćęłńóśźż]|(\b(?:jak|co|pokaż|umiesz|potrafisz|pomoc)\b)/iu.test(
    text
  );
}

function looksEnglish(text = "") {
  return (
    /^[\x00-\x7F]+$/u.test(String(text || "").trim()) &&
    /\b(?:what|how|can|you|help|able|capabilities|ocr)\b/iu.test(text)
  );
}

function resolveSystemHelpReply(message = "") {
  const text = String(message || "").trim();
  if (looksPolish(text)) return SYSTEM_HELP_REPLY_PL;
  if (looksEnglish(text)) return SYSTEM_HELP_REPLY_EN;
  return SYSTEM_HELP_REPLY_RU;
}

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

  // Never send system_help through catalog/LLM path — history + grounding
  // otherwise dumps previous draft product cards as the "answer".
  if (routed.primaryIntent === OFFER_KP_INTENTS.SYSTEM_HELP) {
    return resolveSystemHelpReply(text);
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

module.exports = {
  resolveOfferKpImmediateReply,
  resolveSystemHelpReply,
  SYSTEM_HELP_REPLY_RU,
};
