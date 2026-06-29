/**
 * Обязательные требования к КП OfferKP — нельзя нарушать при create-docx/pdf.
 * Расширяйте этот список; checker в harness валидирует content перед генерацией.
 *
 * @type {Array<{ id: string, severity: "error", description: string, hint: string }>}
 */
const OFFER_KP_MANDATORY_REQUIREMENTS = Object.freeze([
  {
    id: "non-empty-table",
    severity: "error",
    description: "Таблица КП с минимум одной строкой позиции (не только заголовок).",
    hint: "Добавь markdown-таблицу с колонками позиция, кол-во, цена, сумма.",
  },
  {
    id: "price-and-sum-columns",
    severity: "error",
    description: "Колонки цены и суммы в заголовке таблицы.",
    hint: "Заголовок: | Позиция | Кол-во | Цена | Сумма | (или price/sum).",
  },
  {
    id: "numeric-prices",
    severity: "error",
    description: "Числовые цены из каталога, без плейсхолдеров.",
    hint: "Запрещены [цена], «уточните», TBD — только цифры из [Каталог · purolat.com].",
  },
  {
    id: "no-formula-sums",
    severity: "error",
    description: "Сумма строки — готовое число, не формула Excel.",
    hint: "Вызови quote-calculator; не пиши =40*21.27 в ячейке «Сумма».",
  },
  {
    id: "correct-line-totals",
    severity: "error",
    description: "Сумма строки = кол-во × цена (с точностью до копеек).",
    hint: "Пересчитай через quote-calculator и вставь результат в таблицу.",
  },
  {
    id: "no-empty-template",
    severity: "error",
    description: "Запрещён пустой шаблон «для заполнения» без позиций и цен.",
    hint: "Заполни все строки из каталога с SKU, ценами и статусом наличия.",
  },
]);

function getMandatoryQuoteRequirements() {
  return OFFER_KP_MANDATORY_REQUIREMENTS;
}

function mandatoryRequirementsGuidelines() {
  return OFFER_KP_MANDATORY_REQUIREMENTS.map(
    (rule) => `[Обязательно КП] ${rule.description} ${rule.hint}`
  );
}

module.exports = {
  OFFER_KP_MANDATORY_REQUIREMENTS,
  getMandatoryQuoteRequirements,
  mandatoryRequirementsGuidelines,
};
