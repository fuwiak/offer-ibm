/**
 * Расширяемые LLM-инструкции для agent harness OfferKP.
 * Добавляйте новые элементы в массивы ниже — блок offerKp-catalog-guidelines
 * подставит их в контекст агента без правок кода harness.
 *
 * Источник требований: обратная связь по КП (единицы, аналоги, статус, подбор из каталога).
 */

/** @type {Array<{ id: string, text: string, when?: "always"|"quote"|"catalog" }>} */
const OFFER_KP_HARNESS_GUIDELINES = [
  {
    id: "catalog-names-only",
    when: "always",
    text: "Не копируй дословно наименования из PDF/заявки. В КП используй название, SKU и цену из блоков [Каталог · purolat.com].",
  },
  {
    id: "units-from-catalog",
    when: "always",
    text: "Единицу измерения (кг, м, шт, уп) бери из блока каталога или из заявки. Не подставляй «шт», если в заявке или в каталоге указано «кг» или другая единица веса/длины.",
  },
  {
    id: "stock-status-column",
    when: "quote",
    text: "Для каждой позиции КП указывай статус: «В наличии», «В наличии частично», «Аналог», «Под заказ», «Нет в наличии», «Требует проверки» — по данным каталога (count/available).",
  },
  {
    id: "analog-explicit",
    when: "quote",
    text: "Если точного DIN/ГОСТ нет, подбирай аналог по правилам DIN↔ГОСТ и явно пиши «запрошено → подобрано» с указанием стандарта из каталога.",
  },
  {
    id: "prices-catalog-only",
    when: "always",
    text: "Цены только из блоков [Каталог · purolat.com]. Запрещены плейсхолдеры «[цена]», «уточните» и выдуманные суммы.",
  },
  {
    id: "docx-nonempty",
    when: "quote",
    text: "При создании DOCX/PDF через create-docx-file / create-pdf-file передавай полный markdown таблицы КП со всеми строками, количествами, единицами, ценами и статусами — не пустой шаблон.",
  },
  {
    id: "quote-sum-calculator",
    when: "quote",
    text: "Колонка «Сумма» = quantity × unitPrice. Перед DOCX/PDF вызови quote-calculator и вставь готовые числа (850.80), не формулы =40*21.27.",
  },
  {
    id: "name-cosine-fallback",
    when: "always",
    text: "Если точного товара в каталоге нет — подбирай по сходству названия (TF-IDF + косинусное сходство, дополнение fuzzy/Levenshtein). Явно укажи, что позиция подобрана по названию, а не по точному совпадению SKU/стандарта.",
  },
  {
    id: "similar-pick-cheaper",
    when: "quote",
    text: "Если несколько товаров из каталога одинаково подходят по названию или стандарту — выбирай более дешёвый вариант и указывай его цену из блока [Каталог · purolat.com].",
  },
];

/**
 * Приоритеты подбора аналогов (алгоритм для групп товаров).
 * Используются в scoring (analogRules) и в LLM-guidelines harness.
 *
 * @type {Array<{ id: string, requestStandards: string[], prefer: string[], deprioritize?: string[], defaultVariant?: string, note: string }>}
 */
const OFFER_KP_MATCH_PRIORITIES = [
  {
    id: "gost-7798-bolt-din931",
    requestStandards: ["7798", "4014"],
    prefer: ["931"],
    deprioritize: ["933"],
    note: "Болт ГОСТ 7798 / ISO 4014 → приоритет DIN 931 (болт с неполной резьбой), не DIN 933 (полная резьба).",
  },
  {
    id: "gost-11738-screw-din912",
    requestStandards: ["11738"],
    prefer: ["912"],
    defaultVariant: "Н/Р (нормальная резьба)",
    note: "Винт ГОСТ 11738 → DIN 912. По умолчанию выбирай вариант с Н/Р, если в заявке не указано П/Р.",
  },
];

function guidelinesForContext({ quoteDocument = false } = {}) {
  return OFFER_KP_HARNESS_GUIDELINES.filter((g) => {
    if (g.when === "always") return true;
    if (g.when === "quote" && quoteDocument) return true;
    return false;
  }).map((g) => g.text);
}

function matchPriorityHints() {
  return OFFER_KP_MATCH_PRIORITIES.map((p) => p.note);
}

function getOfferKpHarnessGuidelines(options = {}) {
  return [...guidelinesForContext(options), ...matchPriorityHints()];
}

module.exports = {
  OFFER_KP_HARNESS_GUIDELINES,
  OFFER_KP_MATCH_PRIORITIES,
  guidelinesForContext,
  matchPriorityHints,
  getOfferKpHarnessGuidelines,
};
