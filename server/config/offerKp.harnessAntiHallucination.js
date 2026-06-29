/**
 * Анти-галлюцинационный контракт harness OfferKP (retrieve → constrain → verify → abstain).
 * Источник: retrieve-constrain-verify-abstain + CRAG + weakest-claim gate.
 */

const ABSTAIN_MESSAGE =
  "Недостаточно подтверждённых данных в каталоге, чтобы уверенно ответить. Уточните позиции или пришлите заявку с DIN/ГОСТ — без выдуманных цен и наличия.";

const INSUFFICIENT_EVIDENCE_TOKEN = "INSUFFICIENT_EVIDENCE";

/** @type {Record<string, number>} */
const DEFAULT_THRESHOLDS = Object.freeze({
  cragOk: 0.7,
  cragBad: 0.4,
  maxCragHops: 2,
  minCatalogBlocks: 1,
  priceTolerance: 0.02,
});

function parseThresholdsFromEnv() {
  const num = (key, fallback) => {
    const raw = process.env[key];
    if (raw === undefined || raw === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    cragOk: num("OFFER_KP_CRAG_OK", DEFAULT_THRESHOLDS.cragOk),
    cragBad: num("OFFER_KP_CRAG_BAD", DEFAULT_THRESHOLDS.cragBad),
    maxCragHops: Math.max(
      0,
      Math.floor(num("OFFER_KP_MAX_CRAG_HOPS", DEFAULT_THRESHOLDS.maxCragHops))
    ),
    minCatalogBlocks: Math.max(
      0,
      Math.floor(
        num("OFFER_KP_MIN_CATALOG_BLOCKS", DEFAULT_THRESHOLDS.minCatalogBlocks)
      )
    ),
    priceTolerance: num(
      "OFFER_KP_PRICE_TOLERANCE",
      DEFAULT_THRESHOLDS.priceTolerance
    ),
  };
}

/** Retrieve: только факты из подставленного каталога. */
const RETRIEVE_GUIDELINES = [
  "Retrieve: цены, SKU, наличие и наименования — только из блоков [Каталог · purolat.com] или PDF в контексте. Внешние знания модели для фактов запрещены.",
  "Если каталог не подставлен — не угадывай цены; сообщи, что данных нет, или попроси уточнить позиции (без выдуманных сумм).",
];

/** Constrain: генерация строго по контексту, явный abstain. */
const CONSTRAIN_GUIDELINES = [
  `Constrain: если в контексте нет подтверждения — ответь ровно «${INSUFFICIENT_EVIDENCE_TOKEN}» или: «${ABSTAIN_MESSAGE}». Не дополняй ответ общими знаниями.`,
  "Каждая цена и статус наличия в КП должны соответствовать конкретному блоку каталога — не ссылайся на несуществующие SKU.",
  "Запрещены уверенные ответы при пустом или нерелевантном каталоге — лучше отказ, чем догадка.",
];

/** Verify: построчная проверка (weakest claim), не среднее. */
const VERIFY_GUIDELINES = [
  "Verify: перед DOCX/PDF проверь каждую строку таблицы — кол-во × цена = сумма; цена из каталога; без формул и плейсхолдеров.",
  "Одна неподтверждённая строка — исправь или убери её; не отправляй документ с выдуманными позициями.",
];

/** Abstain: отказ как корректный исход. */
const ABSTAIN_GUIDELINES = [
  `Abstain: отказ «${ABSTAIN_MESSAGE}» — правильный ответ, если каталог пуст или позиция не найдена.`,
  "Не маскируй отсутствие данных общими фразами вроде «примерная цена» или «уточните у менеджера» вместо цифр из каталога.",
];

function layerGuidelines(layer) {
  switch (layer) {
    case "retrieve":
      return [...RETRIEVE_GUIDELINES];
    case "constrain":
      return [...CONSTRAIN_GUIDELINES];
    case "verify":
      return [...VERIFY_GUIDELINES];
    case "abstain":
      return [...ABSTAIN_GUIDELINES];
    default:
      return [
        ...RETRIEVE_GUIDELINES,
        ...CONSTRAIN_GUIDELINES,
        ...VERIFY_GUIDELINES,
        ...ABSTAIN_GUIDELINES,
      ];
  }
}

function allAntiHallucinationGuidelines() {
  return layerGuidelines("all");
}

module.exports = {
  ABSTAIN_MESSAGE,
  INSUFFICIENT_EVIDENCE_TOKEN,
  DEFAULT_THRESHOLDS,
  parseThresholdsFromEnv,
  layerGuidelines,
  allAntiHallucinationGuidelines,
};
