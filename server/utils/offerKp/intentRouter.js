"use strict";

/**
 * Deterministic intent signal for OfferKP.
 *
 * This module deliberately does not execute actions. Callers may use the
 * returned policy to decide whether the existing ShopDB / quote pipeline is
 * eligible to run. Prices and SKU values remain guarded by the existing
 * matchInquiryLines + quoteDbPriceGate contracts.
 */

const OFFER_KP_INTENTS = Object.freeze({
  PRODUCT_INQUIRY: "product_inquiry",
  PRODUCT_SEARCH: "product_search",
  CREATE_QUOTE: "create_quote",
  EDIT_QUOTE: "edit_quote",
  DOCUMENT_QUESTION: "document_question",
  SYSTEM_HELP: "system_help",
  CASUAL_OR_TEST: "casual_or_test",
  UNSAFE_OR_FORBIDDEN: "unsafe_or_forbidden",
  OUT_OF_SCOPE: "out_of_scope",
  AMBIGUOUS: "ambiguous",
});

const START_QUOTE_PROMPTS = Object.freeze([
  "Разбери прикреплённую заявку и извлеки позиции крепежа для КП",
  "Сформируй черновик КП по списку позиций из каталога purolat.com",
  "Подбери аналоги DIN/ГОСТ для позиций, которых нет в наличии",
  "Проверь наличие и цены по заявке перед формированием КП",
  "Подготовь КП в PDF/DOCX с таблицей позиций, ценами и статусами",
]);

const PRODUCT_SIGNAL_PATTERNS = [
  /(?:^|[^\p{L}\p{N}])(?:din|гост|gost|iso)\s*[-№]?\s*\d{3,5}(?:$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])м\s*\d+(?:\s*[xх×*]\s*\d+)?(?:$|[^\p{L}\p{N}])/iu,
  /\bm\s*\d+(?:\s*[xх×*]\s*\d+)?\b/iu,
  /\b\d+(?:[.,]\d+)?\s*(?:шт|штук|кг|метр(?:а|ов)?|м|уп|упак|pack|pcs?)\b/iu,
  /(?:болт|гайк|шайб|винт|шпильк|штифт|анкер|саморез|креп[её]ж|nut|bolt|washer|screw)/iu,
  /\b(?:арт|артикул|sku|код)\s*[:№.-]?\s*\d{5,18}\b/iu,
];

const UNSAFE_PATTERNS = [
  /(?:игнорируй|обойди|забудь).{0,60}(?:shopdb|баз|инструкц|правил|огранич)/iu,
  /(?:придумай|выдумай|сгенерируй|назначь).{0,40}(?:цен|стоимост|sku|артикул)/iu,
  /(?:цен|стоимост).{0,40}(?:придумай|выдумай|сгенерируй|назначь)/iu,
  /(?:цен|стоимост).{0,60}(?:из интернета|в интернете|на сайте конкурент|у конкурент|с другого сайт|из предыдущего ответ)/iu,
  /(?:возьми|перенеси|подставь).{0,50}цен.{0,50}(?:похож|similar|исходн)/iu,
  /(?:покажи|раскрой|выведи).{0,40}(?:системн(?:ый|ого) промпт|скрыт(?:ые|ую) инструкц)/iu,
];

const EDIT_QUOTE_PATTERNS = [
  /(?:замени|измени|поменяй|удали|добавь).{0,50}(?:позиц|строк|товар|болт|гайк|шайб|винт)/iu,
  /(?:поставь|укажи|измени).{0,45}(?:количеств|\d+\s*(?:шт|кг|уп))/iu,
  /(?:выбери|подставь).{0,30}(?:перв|втор|трет).{0,20}(?:аналог|вариант)/iu,
  /(?:единиц[ауы]?\s+измерения|ед\.?\s*изм).{0,20}(?:шт|кг|м|уп)/iu,
];

const DOCUMENT_QUESTION_PATTERNS = [
  /(?:что|сколько|какие|где).{0,45}(?:в|на|из).{0,20}(?:pdf|файл|документ|заявк|страниц)/iu,
  /(?:сравни|сверь|проверь).{0,35}(?:таблиц|черновик).{0,35}(?:оригинал|pdf|заявк)/iu,
];

const SYSTEM_HELP_PATTERNS = [
  /(?:что ты умеешь|как (?:загрузить|прикрепить|создать|сформировать)|как это работает)/iu,
  /(?:почему|что значит).{0,45}(?:цена отсутствует|нет цены|требует проверки|нет в базе)/iu,
];

const CASUAL_PATTERNS = [
  /^(?:привет|здравствуй|добрый (?:день|вечер)|hello|hi|ты работаешь|проверка|тест|ау|бобик жив|скажи банан)[!?.\s]*$/iu,
  /^\d{1,4}$/u,
];

const OUT_OF_SCOPE_PATTERNS = [
  /(?:какая|какой).{0,20}погод/iu,
  /(?:напиши|сочини).{0,20}(?:стих|рассказ|песн)/iu,
  /(?:кто президент|почини windows|курс валют|новости спорта)/iu,
  /(?:din|гост|iso)\s*\d{3,5}.{0,40}(?:истори|кто разработал|когда принят)/iu,
];

function normalizeIntentText(text = "") {
  return String(text || "")
    .replace(/^@agent\s*:?\s*/i, "")
    .replace(/[ё]/gi, (ch) => (ch === "Ё" ? "Е" : "е"))
    .replace(/(\d)\s*[х×*]\s*(\d)/gi, "$1x$2")
    .replace(/\s+/g, " ")
    .trim();
}

const NORMALIZED_START_PROMPTS = new Map(
  START_QUOTE_PROMPTS.map((prompt, index) => [
    normalizeIntentText(prompt).toLowerCase(),
    index,
  ])
);

function countMatches(text, patterns) {
  return patterns.reduce(
    (count, pattern) => count + Number(pattern.test(text)),
    0
  );
}

function defaultPolicy(primaryIntent) {
  const I = OFFER_KP_INTENTS;
  const catalogIntents = new Set([
    I.PRODUCT_INQUIRY,
    I.PRODUCT_SEARCH,
    I.CREATE_QUOTE,
  ]);
  return {
    allowShopDbSearch: catalogIntents.has(primaryIntent),
    allowQuoteMutation: [
      I.PRODUCT_INQUIRY,
      I.CREATE_QUOTE,
      I.EDIT_QUOTE,
    ].includes(primaryIntent),
    allowCatalogPriceUse: catalogIntents.has(primaryIntent),
    allowExport: primaryIntent === I.CREATE_QUOTE,
    allowWebSearch: false,
    allowLlmPrice: false,
  };
}

function buildResult({ primaryIntent, intents, confidence, signals = {} }) {
  const uniqueIntents = [...new Set([primaryIntent, ...(intents || [])])];
  const policy = defaultPolicy(primaryIntent);
  if (primaryIntent === OFFER_KP_INTENTS.UNSAFE_OR_FORBIDDEN) {
    policy.allowShopDbSearch = false;
    policy.allowQuoteMutation = false;
    policy.allowCatalogPriceUse = false;
    policy.allowExport = false;
  }
  return {
    intent: primaryIntent,
    primaryIntent,
    intents: uniqueIntents,
    confidence,
    source: "rule",
    signals,
    policy,
  };
}

function routeOfferKpMessage(input = "") {
  const text = normalizeIntentText(input);
  const lower = text.toLowerCase();
  const I = OFFER_KP_INTENTS;
  if (!text) {
    return buildResult({ primaryIntent: I.AMBIGUOUS, confidence: 0 });
  }

  const productSignalCount = countMatches(text, PRODUCT_SIGNAL_PATTERNS);
  const hasProductSignal = productSignalCount > 0;
  const intents = [];

  if (CASUAL_PATTERNS.some((pattern) => pattern.test(text))) {
    intents.push(I.CASUAL_OR_TEST);
  } else if (/^(?:привет|здравствуй|hello|hi)(?:[\s,!?.]|$)/iu.test(text)) {
    intents.push(I.CASUAL_OR_TEST);
  }

  const explicitQuote =
    /(?:начать с|сделай|сформируй|подготовь|сгенерируй|создай|выгрузи|экспортируй).{0,55}(?:(?:^|[^\p{L}\p{N}])кп(?:$|[^\p{L}\p{N}])|коммерческ|оферт|quote|proposal)/iu.test(
      text
    ) ||
    /(?:(?:^|[^\p{L}\p{N}])кп(?:$|[^\p{L}\p{N}])|коммерческ|оферт|quote).{0,45}(?:pdf|docx|word|документ|таблиц)/iu.test(
      text
    );
  if (explicitQuote) intents.push(I.CREATE_QUOTE);
  if (UNSAFE_PATTERNS.some((pattern) => pattern.test(text))) {
    return buildResult({
      primaryIntent: I.UNSAFE_OR_FORBIDDEN,
      intents,
      confidence: 1,
      signals: { unsafe: true, productSignalCount, explicitQuote },
    });
  }

  const startPromptIndex = NORMALIZED_START_PROMPTS.get(lower);
  if (startPromptIndex != null) {
    const promptIntents = [
      I.PRODUCT_INQUIRY,
      I.CREATE_QUOTE,
      I.PRODUCT_SEARCH,
      I.PRODUCT_SEARCH,
      I.CREATE_QUOTE,
    ];
    return buildResult({
      primaryIntent: promptIntents[startPromptIndex],
      intents,
      confidence: 1,
      signals: {
        startQuotePrompt: true,
        startQuotePromptIndex: startPromptIndex,
        productSignalCount,
        quoteExport: startPromptIndex === 4,
        quoteDraft: startPromptIndex === 1,
      },
    });
  }

  if (EDIT_QUOTE_PATTERNS.some((pattern) => pattern.test(text))) {
    return buildResult({
      primaryIntent: I.EDIT_QUOTE,
      intents,
      confidence: 0.97,
      signals: { productSignalCount },
    });
  }
  if (DOCUMENT_QUESTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return buildResult({
      primaryIntent: I.DOCUMENT_QUESTION,
      intents,
      confidence: 0.96,
      signals: { productSignalCount },
    });
  }
  if (SYSTEM_HELP_PATTERNS.some((pattern) => pattern.test(text))) {
    return buildResult({
      primaryIntent: I.SYSTEM_HELP,
      intents,
      confidence: 0.96,
      signals: { productSignalCount },
    });
  }
  if (OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(text))) {
    return buildResult({
      primaryIntent: I.OUT_OF_SCOPE,
      intents,
      confidence: 0.97,
      signals: { productSignalCount, hardNegative: hasProductSignal },
    });
  }
  if (explicitQuote) {
    return buildResult({
      primaryIntent: I.CREATE_QUOTE,
      intents,
      confidence: 0.98,
      signals: {
        productSignalCount,
        quoteExport: /pdf|docx|word|выгруз|экспорт/iu.test(text),
      },
    });
  }

  const productSearch =
    /(?:найди|покажи|подбери|сравни|проверь|ищу|есть ли|что есть).{0,70}(?:болт|гайк|шайб|винт|шпильк|штифт|анкер|креп[её]ж|din|гост|gost|iso|каталог|аналог|налич|цен)/iu.test(
      text
    ) ||
    /(?:аналог|замен|дешевле|вариант).{0,55}(?:din|гост|болт|гайк|шайб|винт|товар|позиц)/iu.test(
      text
    );
  if (productSearch) {
    return buildResult({
      primaryIntent: I.PRODUCT_SEARCH,
      intents,
      confidence: 0.97,
      signals: { productSignalCount },
    });
  }

  const hasQuantity =
    /\b\d+(?:[.,]\d+)?\s*(?:шт|штук|кг|м|уп|упак|pack|pcs?)\b/iu.test(text);
  if (productSignalCount >= 2 || (hasProductSignal && hasQuantity)) {
    return buildResult({
      primaryIntent: I.PRODUCT_INQUIRY,
      intents,
      confidence: 0.96,
      signals: { productSignalCount, hasQuantity },
    });
  }
  if (intents.includes(I.CASUAL_OR_TEST)) {
    return buildResult({
      primaryIntent: I.CASUAL_OR_TEST,
      intents,
      confidence: 0.99,
      signals: { productSignalCount },
    });
  }
  if (hasProductSignal) {
    return buildResult({
      primaryIntent: I.AMBIGUOUS,
      intents,
      confidence: 0.55,
      signals: { productSignalCount },
    });
  }
  return buildResult({
    primaryIntent: I.OUT_OF_SCOPE,
    intents,
    confidence: 0.7,
    signals: { productSignalCount },
  });
}

module.exports = {
  OFFER_KP_INTENTS,
  START_QUOTE_PROMPTS,
  normalizeIntentText,
  routeOfferKpMessage,
};
