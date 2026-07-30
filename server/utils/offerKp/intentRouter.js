"use strict";

/**
 * Deterministic intent signal for OfferKP.
 *
 * This module deliberately does not call an LLM and does not execute actions.
 * Callers may use the returned policy to decide whether the existing ShopDB /
 * quote pipeline is eligible to run. Prices and SKU values remain guarded by
 * the existing matchInquiryLines + quoteDbPriceGate contracts.
 *
 * LLM tie-break (intentLlmJudge.resolveOfferKpIntent) runs ONLY when
 * needsLlmIntentJudge(result) is true — i.e. primaryIntent === ambiguous.
 * Confident routes (product_inquiry / create_quote / …) never pay for a judge.
 */

const OFFER_KP_INTENTS = Object.freeze({
  PRODUCT_INQUIRY: "product_inquiry",
  PRODUCT_SEARCH: "product_search",
  CREATE_QUOTE: "create_quote",
  EDIT_QUOTE: "edit_quote",
  DOCUMENT_QUESTION: "document_question",
  DATA_QUESTION: "data_question",
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
  /(?:^|[^\p{L}\p{N}])m\s*\d+(?:\s*[xх×*]\s*\d+)?(?:$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:шт|штук|кг|метр(?:а|ов)?|м|уп|упак|pack|pcs?)(?:$|[^\p{L}\p{N}])/iu,
  /(?:болт|гайк|шайб|винт|шпильк|штифт|анкер|саморез|креп[её]ж|nut|bolt|washer|screw)/iu,
  /(?:^|[^\p{L}\p{N}])(?:арт|артикул|sku|код)\.?\s*[:№.-]?\s*\d{5,18}(?:$|[^\p{L}\p{N}])/iu,
];

const UNSAFE_PATTERNS = [
  /(?:игнорируй|обойди|забудь).{0,60}(?:shopdb|баз|инструкц|правил|огранич)/iu,
  /(?:придумай|выдумай|сгенерируй|назначь).{0,40}(?:цен|стоимост|sku|артикул)/iu,
  /(?:цен|стоимост).{0,40}(?:придумай|выдумай|сгенерируй|назначь)/iu,
  /(?:цен|стоимост).{0,60}(?:из интернета|в интернете|на сайте конкурент|у конкурент|с другого сайт|из предыдущего ответ)/iu,
  /(?:возьми|перенеси|подставь).{0,50}цен.{0,50}(?:похож|similar|исходн)/iu,
  /(?:покажи|раскрой|выведи).{0,40}(?:системн(?:ый|ого) промпт|скрыт(?:ые|ую) инструкц)/iu,
  /(?:используй|возьми|поставь|подставь).{0,35}цен.{0,35}(?:похож|друг|конкурент)/iu,
  /(?:создай|сгенерируй).{0,35}(?:несуществующ|нов).{0,20}(?:sku|артикул)/iu,
  /(?:найди|ищи|поищи).{0,55}(?:товар|болт|гайк|шайб|винт).{0,35}(?:в интернете|google|вместо shopdb)/iu,
  /(?:не обращай внимания|игнорируй).{0,45}(?:правил|огранич|инструкц)/iu,
];

const EDIT_QUOTE_PATTERNS = [
  /(?:замени|измени|поменяй|удали|добавь).{0,50}(?:позиц|строк|товар|болт|гайк|шайб|винт|штифт|шпильк)/iu,
  /(?:переделай|обнови|пересобери|перегенерируй).{0,50}(?:кп|docx|pdf|word|документ|файл|черновик|сводк|предложен)/iu,
  /(?:добавь|вставь).{0,35}\d+\s*(?:шт|штук|кг|уп(?:аковок)?).{0,25}(?:^|[^\p{L}\p{N}])кп(?:$|[^\p{L}\p{N}])/iu,
  /(?:поставь|укажи|измени|проставь|исправь|поправь|скорректируй).{0,45}(?:количеств|\d+\s*(?:шт|кг|уп)|цен|покупател|страну)/iu,
  /(?:выбери|подставь).{0,30}(?:перв|втор|трет).{0,20}(?:аналог|вариант)/iu,
  /(?:единиц[ауы]?\s+измерения|ед\.?\s*изм).{0,20}(?:шт|кг|м|уп)/iu,
  /(?:отметь|подтверди).{0,35}(?:позиц|строк).{0,30}(?:провер|согласован)/iu,
  /(?:исправь|поправь|замени|удали|убери|обнови).{0,40}(?:в\s+кп|в\s+черновик|в\s+документ|в\s+файл|в\s+таблиц|в\s+сводк|в\s+предложен)/iu,
  /(?:поставь|проставь|смени|переименуй).{0,35}(?:покупател|назван|количеств|цен).{0,40}(?:в\s+кп|в\s+черновик|в\s+строк|в\s+предложен)?/iu,
  /(?:удали|убери).{0,30}(?:строк|позиц).{0,25}(?:из\s+кп|из\s+черновик|из\s+таблиц|из\s+предложен)/iu,
  /(?:обнови|пересобери|перегенерируй).{0,30}(?:уже\s+)?(?:готов|сгенер|создан).{0,20}(?:кп|файл|документ|pdf|docx)/iu,
];

const DOCUMENT_QUESTION_PATTERNS = [
  /(?:что|сколько|какие|где).{0,45}(?:в|на|из).{0,20}(?:pdf|файл|документ|заявк|страниц)/iu,
  /(?:сравни|сверь|проверь).{0,35}(?:таблиц|черновик).{0,35}(?:оригинал|pdf|заявк)/iu,
  /(?:какое|сколько).{0,25}(?:количеств|позиц).{0,35}(?:указан|в заявк|в файл)/iu,
  /(?:покажи|выведи).{0,25}(?:текст|содержим).{0,35}(?:загруж|прикрепл|документ|pdf|файл)/iu,
  /(?:на какой|какая).{0,20}страниц.{0,40}(?:указан|наход|болт|гайк|din|гост)/iu,
  /(?:сравни|сверь).{0,35}(?:сводк|позиц|таблиц).{0,35}(?:исходн|оригинал|pdf)/iu,
  /(?:есть ли|имеется ли).{0,20}(?:в pdf|в документ|в файл)/iu,
  /(?:почему|как).{0,25}ocr.{0,40}(?:прочитал|распознал|извл[её]к)/iu,
  // Questions about already-generated KP / draft summary (not mutation).
  /(?:что|сколько|какие|какая|какой|где).{0,40}(?:в|по|из).{0,15}(?:кп|черновик|сводк|таблиц|предложен)/iu,
  /(?:какая|сколько|какой).{0,30}(?:цена|сумм|итого|позиц|строк).{0,35}(?:в\s+кп|в\s+черновик|в\s+сводк|по\s+строк|в\s+таблиц|в\s+предложен)/iu,
  /(?:покажи|выведи|напомни).{0,25}(?:сводк|черновик|содержим).{0,25}(?:кп|предложен)?/iu,
  /(?:покажи|выведи).{0,25}(?:позиц|таблиц).{0,25}(?:кп|черновик|предложен|сводк)/iu,
  /(?:объясни|расскажи|уточни|почему).{0,45}(?:строк|позиц|матч|статус|почем).{0,35}(?:в\s+кп|в\s+черновик|в\s+таблиц|в\s+сводк)/iu,
  /(?:что\s+у\s+нас\s+в|что\s+сейчас\s+в).{0,15}(?:кп|черновик|сводк|предложен)/iu,
];

const SYSTEM_HELP_PATTERNS = [
  /(?:что ты умеешь|как (?:загрузить|прикрепить|создать|сформировать)|как это работает)/iu,
  /(?:почему|что значит).{0,45}(?:цена отсутствует|нет цен\w*|требует проверки|нет в базе)/iu,
  /(?:откуда|как).{0,35}(?:система|offerkp).{0,30}(?:бер[её]т|получает).{0,20}цен/iu,
  /как\s+(?:выбрать|подтвердить).{0,30}(?:аналог|товар|позици)/iu,
  /какие.{0,25}(?:формат|тип).{0,20}файл.{0,20}(?:поддерж|можно)/iu,
];

/** Aggregate / schema questions about ShopDB (not a product SKU lookup). */
const DATA_QUESTION_PATTERNS = [
  /(?:сколько|какое\s+количество|ile|how\s+many).{0,40}(?:товар|продукт|позиц|product|sku|артикул|строк).{0,40}(?:каталог|баз|shopdb|purolat|catalog)/iu,
  /(?:сколько|какое\s+количество).{0,40}(?:строк|запис).{0,30}(?:каталог|shopdb|баз)/iu,
  /(?:какие|список|what|jakie).{0,35}(?:категор|categor).{0,40}(?:баз|каталог|есть|list)?/iu,
  /(?:категор).{0,40}(?:есть|в\s+баз|в\s+каталог)/iu,
  /(?:самый|наиболее|most).{0,25}(?:дорог|дешев|expensive|cheap).{0,40}(?:товар|позиц|product|в\s+каталог|в\s+баз)?/iu,
  /(?:какой|какая).{0,25}(?:товар|позиц|product).{0,35}(?:самый\s+)?(?:дорог|дешев|expensive)/iu,
  /(?:есть\s+ли|есть\s+ли\s+ли).{0,25}(?:дубликат|повтор).{0,25}(?:sku|артикул)/iu,
  /(?:дубликат\w*|duplicate).{0,30}(?:sku|артикул)/iu,
  /(?:сколько|есть\s+ли).{0,40}(?:без\s+цен|без\s+цены|нулев\w*\s+цен)/iu,
  /(?:без\s+цен|без\s+цены).{0,40}(?:sku|артикул|строк|shopdb|каталог|баз)/iu,
  /(?:расскажи|опиши|overview).{0,40}(?:о\s+)?(?:данн|каталог|shopdb|баз)/iu,
  /what\s+products\s+are\s+in\s+the\s+catalog/iu,
  /ile\s+produkt/iu,
  /(?:средн|мин|макс|min|max|avg|диапазон).{0,30}цен.{0,30}(?:каталог|баз|shopdb|sku)?/iu,
  /(?:какие|какое).{0,30}(?:покрыт|прочн|класс).{0,40}(?:у\s+болт|в\s+каталог|встреча)/iu,
  /(?:сколько|какие|какая).{0,40}(?:позиц|строк).{0,40}(?:есть\s+в\s+баз|в\s+каталог|в\s+shopdb|сматч)/iu,
];

const CASUAL_PATTERNS = [
  /^(?:привет|здравствуй(?:те)?|добрый (?:день|вечер)|hello|hi|how are you|ты работаешь|проверка|тест|ау|бобик жив|скажи банан)[!?.\s]*$/iu,
  /^(?:скажи|повтори|say)\s+(?!.*(?:цен|стоим|болт|гайк|шайб|винт|креп[её]ж|кп|sku|артикул|din|гост|каталог|purolat))[\p{L}\p{N}._-]{1,40}[!?.\s]*$/iu,
  /^\d{1,4}$/u,
  /^(?:тест\s*){2,}$/iu,
  /^(?:работает ли чат|чат работает)[!?.\s]*$/iu,
];

// A single bare word with no digits/punctuation is almost always a bot/
// connectivity probe ("asdf", "xyz") rather than a real query — but matching
// ANY 3-8 letter Latin word by default would misclassify a genuine short
// product term in another language (e.g. Spanish "tornillo") as casual/test
// chat. Only treat it as a probe when it carries no product signal at all;
// language of the word is never a reason by itself to reject or downrank it.
const BARE_PROBE_WORD_RE = /^(?:\.{2,}|[a-z]{3,8})$/iu;

function isCasualOrTestMessage(text, hasProductSignal) {
  if (CASUAL_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (hasProductSignal) return false;
  return BARE_PROBE_WORD_RE.test(text);
}

const OUT_OF_SCOPE_PATTERNS = [
  /(?:какая|какой).{0,20}погод/iu,
  /(?:напиши|сочини).{0,20}(?:стих|рассказ|песн)/iu,
  /(?:кто президент|почини windows|курс валют|новости спорта)/iu,
  /(?:din|гост|iso)\s*\d{3,5}.{0,40}(?:истори|кто разработал|когда принят)/iu,
  /(?:истори|происхожден).{0,45}(?:стандарт|din|гост|iso)/iu,
  /(?:что означает|что такое).{0,35}(?:стандарт|din|гост|iso)/iu,
  /(?:объясни|расскажи).{0,35}(?:как производят|производство|изготовлен).{0,25}(?:болт|гайк|шайб|винт)/iu,
  /(?:переведи|перевод).{0,35}(?:din|гост|iso)/iu,
  /(?:сколько будет|реши|посчитай).{0,35}(?:плюс|минус|умнож|раздел|\d\s*[+*/-]\s*\d)/iu,
];

function normalizeIntentText(text = "") {
  let t = String(text || "");
  try {
    const { stripMessengerExportNoise } = require("./parseInquiry");
    t = stripMessengerExportNoise(t);
  } catch {
    // parseInquiry may not be available in isolated tests — keep raw.
  }
  return t
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

function defaultPolicy(primaryIntent, intents = []) {
  const I = OFFER_KP_INTENTS;
  const allIntents = new Set([primaryIntent, ...intents]);
  const catalogIntents = new Set([
    I.PRODUCT_INQUIRY,
    I.PRODUCT_SEARCH,
    I.CREATE_QUOTE,
    I.DATA_QUESTION,
  ]);
  return {
    allowShopDbSearch: [...catalogIntents].some((intent) =>
      allIntents.has(intent)
    ),
    allowQuoteMutation: [I.PRODUCT_INQUIRY, I.CREATE_QUOTE, I.EDIT_QUOTE].some(
      (intent) => allIntents.has(intent)
    ),
    allowCatalogPriceUse: [I.PRODUCT_INQUIRY, I.PRODUCT_SEARCH, I.CREATE_QUOTE].some(
      (intent) => allIntents.has(intent)
    ),
    allowExport: primaryIntent === I.CREATE_QUOTE,
    allowWebSearch: false,
    allowLlmPrice: false,
    answerMode:
      primaryIntent === I.DATA_QUESTION
        ? "aggregate"
        : primaryIntent === I.DOCUMENT_QUESTION
          ? "document"
          : "default",
  };
}

function buildResult({
  primaryIntent,
  intents,
  confidence,
  signals = {},
  policyOverrides = {},
}) {
  const uniqueIntents = [...new Set([primaryIntent, ...(intents || [])])];
  const policy = {
    ...defaultPolicy(primaryIntent, uniqueIntents),
    ...policyOverrides,
  };
  if (
    primaryIntent === OFFER_KP_INTENTS.UNSAFE_OR_FORBIDDEN ||
    primaryIntent === OFFER_KP_INTENTS.OUT_OF_SCOPE
  ) {
    policy.allowShopDbSearch = false;
    policy.allowCatalogPriceUse = false;
    policy.allowQuoteMutation = false;
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
  const addIntent = (intent) => {
    if (intent && !intents.includes(intent)) intents.push(intent);
  };

  if (isCasualOrTestMessage(text, hasProductSignal)) {
    addIntent(I.CASUAL_OR_TEST);
  } else if (
    /^(?:привет|здравствуй(?:те)?|добрый\s+(?:день|вечер)|hello|hi)(?:[\s,!?.]|$)/iu.test(
      text
    )
  ) {
    // Greeting prefix is a secondary dialog signal; primary stays quote/search
    // when the body carries products or an explicit KP request.
    addIntent(I.CASUAL_OR_TEST);
  }

  const explicitQuote =
    /(?:начать с|начн[её]м с|сделай|сделать|сформируй|подготовь|сгенерируй|создай|выгрузи|экспортируй|[сc]остав(?:ь|ить)?|собери).{0,55}(?:(?:^|[^\p{L}\p{N}])кп(?:$|[^\p{L}\p{N}])|коммерческ|оферт|quote|proposal)/iu.test(
      text
    ) ||
    /(?:(?:^|[^\p{L}\p{N}])кп(?:$|[^\p{L}\p{N}])|коммерческ|оферт|quote).{0,45}(?:pdf|docx|word|документ|таблиц)/iu.test(
      text
    ) ||
    /сделай.{0,25}документ.{0,40}(?:текущ|этим|данн).{0,20}(?:позиц|товар|черновик)/iu.test(
      text
    ) ||
    /(?:просьб\w+|просим|прошу|просьба).{0,50}(?:направить|выслать|подготовить|сформировать|прислать|направьте).{0,50}(?:предложен|кп|оферт|коммерческ)/iu.test(
      text
    ) ||
    /(?:предложен\w+\s+на\s+поставку|коммерческ\w+\s+предложен|оферт\w+\s+на\s+поставку)/iu.test(
      text
    ) ||
    /направьте?\s+(?:пожалуйста\s+)?(?:кп|предложен|оферт|коммерческ)/iu.test(
      text
    );
  const editIntent = EDIT_QUOTE_PATTERNS.some((pattern) => pattern.test(text));
  const documentIntent = DOCUMENT_QUESTION_PATTERNS.some((pattern) =>
    pattern.test(text)
  );
  const dataQuestionIntent = DATA_QUESTION_PATTERNS.some((pattern) =>
    pattern.test(text)
  );
  const systemHelpIntent = SYSTEM_HELP_PATTERNS.some((pattern) =>
    pattern.test(text)
  );
  const outOfScopeIntent = OUT_OF_SCOPE_PATTERNS.some((pattern) =>
    pattern.test(text)
  );
  const productSearch =
    /(?:найди|покажи|подбери|сравни|проверь|ищу|есть ли|что есть).{0,80}(?:товар|болт|гайк|шайб|винт|шпильк|штифт|анкер|креп[её]ж|din|гост|gost|iso|shopdb|каталог|аналог|замен|вариант|похож|позиц|налич|цен)/iu.test(
      text
    ) ||
    /что\s+есть\s+вместо.{0,50}(?:товар|болт|гайк|шайб|винт|din|гост|iso)/iu.test(
      text
    ) ||
    /(?:подставь|подтяни|обнови|добавь).{0,45}(?:каталог|purolat|shopdb|цен|sku|артикул)/iu.test(
      text
    );

  if (explicitQuote) addIntent(I.CREATE_QUOTE);
  if (editIntent) addIntent(I.EDIT_QUOTE);
  if (documentIntent) addIntent(I.DOCUMENT_QUESTION);
  if (dataQuestionIntent) addIntent(I.DATA_QUESTION);
  if (systemHelpIntent) addIntent(I.SYSTEM_HELP);
  if (productSearch) addIntent(I.PRODUCT_SEARCH);

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

  if (outOfScopeIntent && !dataQuestionIntent) {
    if (hasProductSignal) addIntent(I.PRODUCT_SEARCH);
    return buildResult({
      primaryIntent: I.OUT_OF_SCOPE,
      intents,
      confidence: 0.97,
      signals: { productSignalCount, hardNegative: hasProductSignal },
    });
  }

  // Search is the first executable step in compound requests such as
  // "найди ... и добавь ..."; the edit action remains a secondary intent.
  // But edits that clearly target an existing KP/draft stay EDIT_QUOTE.
  const quoteRegeneration =
    editIntent &&
    (/(?:переделай|обнови|пересобери|перегенерируй)/iu.test(text) ||
      /(?:docx|pdf|word|документ|файл)/iu.test(text));
  const editTargetsExistingQuote =
    editIntent &&
    /(?:кп|черновик|сводк|строк|позиц|предложен|таблиц|покупател)/iu.test(text);
  const compoundSearchThenAdd =
    productSearch &&
    editIntent &&
    /(?:найди|подбери|покажи|ищу|есть ли)/iu.test(text) &&
    /добавь/iu.test(text);
  if (
    productSearch &&
    editIntent &&
    !quoteRegeneration &&
    (!editTargetsExistingQuote || compoundSearchThenAdd)
  ) {
    return buildResult({
      primaryIntent: I.PRODUCT_SEARCH,
      intents,
      confidence: 0.97,
      signals: { productSignalCount },
    });
  }

  if (editIntent) {
    // Adding a concrete product to the quote may need a ShopDB lookup.
    if (hasProductSignal && /добавь/iu.test(text)) addIntent(I.PRODUCT_SEARCH);
    return buildResult({
      primaryIntent: I.EDIT_QUOTE,
      intents,
      confidence: 0.97,
      signals: { productSignalCount, quoteRegeneration },
      policyOverrides: quoteRegeneration ? { allowExport: true } : {},
    });
  }

  // Catalog aggregates / ShopDB schema questions — deterministic query plans.
  // Prefer over PDF document_question when both fire (e.g. «позиции в базе»).
  // Explicit product_search ("найди/подбери …") wins over aggregates.
  if (dataQuestionIntent && !editIntent && !explicitQuote && !productSearch) {
    return buildResult({
      primaryIntent: I.DATA_QUESTION,
      intents,
      confidence: 0.96,
      signals: { productSignalCount, dataQuestion: true },
      policyOverrides: {
        allowShopDbSearch: true,
        allowQuoteMutation: false,
        allowCatalogPriceUse: false,
        allowExport: false,
        answerMode: "aggregate",
      },
    });
  }

  // A document question stays non-mutating even when it also asks whether a
  // quote can be created; the quote intent is retained for the next turn.
  // Questions about КП/черновик must pass (not out_of_scope) — LLM/draft path.
  if (documentIntent) {
    return buildResult({
      primaryIntent: I.DOCUMENT_QUESTION,
      intents,
      confidence: 0.96,
      signals: { productSignalCount },
      policyOverrides: {
        allowShopDbSearch: false,
        allowQuoteMutation: false,
        allowCatalogPriceUse: false,
        allowExport: false,
        answerMode: "document",
      },
    });
  }

  if (productSearch) {
    return buildResult({
      primaryIntent: I.PRODUCT_SEARCH,
      intents,
      confidence: 0.97,
      signals: { productSignalCount },
    });
  }

  const hasQuantity =
    /(?:^|[^\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:шт|штук|кг|м|уп|упак|pack|pcs?)(?:$|[^\p{L}\p{N}])/iu.test(
      text
    );

  if (explicitQuote) {
    const exportDenied = /(?:не|ничего не)\s+экспортируй|без\s+экспорта/iu.test(
      text
    );
    return buildResult({
      primaryIntent: I.CREATE_QUOTE,
      intents,
      confidence: 0.98,
      signals: {
        productSignalCount,
        hasQuantity,
        supplyRequest: hasProductSignal,
        quoteExport: /pdf|docx|word|выгруз|экспорт/iu.test(text),
      },
      policyOverrides: exportDenied ? { allowExport: false } : {},
    });
  }

  if (systemHelpIntent) {
    return buildResult({
      primaryIntent: I.SYSTEM_HELP,
      intents,
      confidence: 0.96,
      signals: { productSignalCount },
    });
  }

  // Pasted multi-line RFQ (≥2 inquiry lines + qty) → create_quote draft path.
  // Export stays off until an explicit «сделай КП / PDF» phrase (explicitQuote).
  if (hasProductSignal && hasQuantity) {
    try {
      const { parseInquiryText } = require("./parseInquiry");
      const inquiryLineCount = parseInquiryText(text).length;
      if (inquiryLineCount >= 2) {
        addIntent(I.CREATE_QUOTE);
        return buildResult({
          primaryIntent: I.CREATE_QUOTE,
          intents,
          confidence: 0.95,
          signals: {
            productSignalCount,
            hasQuantity,
            multiLineRfq: true,
            inquiryLineCount,
          },
          policyOverrides: { allowExport: false },
        });
      }
    } catch {
      /* parseInquiry may be unavailable in isolated unit tests */
    }
  }

  if (productSignalCount >= 2) {
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
  const hasAmbiguousDomainWord =
    hasProductSignal ||
    /^(?:аналог|цена|стоимость|кп)[!?.\s]*$/iu.test(text) ||
    hasQuantity;
  if (hasAmbiguousDomainWord) {
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

/** True only for the rare tie-break bucket — never for confident routes. */
function needsLlmIntentJudge(routed = {}) {
  return routed?.primaryIntent === OFFER_KP_INTENTS.AMBIGUOUS;
}

module.exports = {
  OFFER_KP_INTENTS,
  START_QUOTE_PROMPTS,
  normalizeIntentText,
  routeOfferKpMessage,
  buildResult,
  needsLlmIntentJudge,
};
