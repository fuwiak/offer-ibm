/**
 * Обязательные требования к КП OfferKP — нельзя нарушать при create-docx/pdf.
 * ChatGPT-style: без цены ShopDB колонка цены пустая / «под заказ» — никогда не угадывать.
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
    description:
      "Числовые цены только из ShopDB; без цены каталога — пусто или «под заказ».",
    hint: "Запрещены выдуманные цифры и [цена]/TBD. Нет в ShopDB → «под заказ» (пустая колонка цены).",
  },
  {
    id: "invalid-quantity",
    severity: "error",
    description: "Количество в каждой строке — положительное число из PDF-заявки.",
    hint: "Возьми кол-во из прикреплённого PDF (не 0 и не пусто); цену — из каталога или «под заказ».",
  },
  {
    id: "no-formula-sums",
    severity: "error",
    description: "Сумма строки — готовое число, не формула Excel.",
    hint: "Вызови quote-calculator; не пиши =40*21.27 в ячейке «Сумма». Для «под заказ» сумму оставь «—».",
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
    description: "Запрещён пустой шаблон «для заполнения» без позиций.",
    hint: "Заполни строки из заявки; цены — из каталога или «под заказ», без выдуманных сумм.",
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
