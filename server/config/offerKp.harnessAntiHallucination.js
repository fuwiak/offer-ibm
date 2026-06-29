/**
 * Анти-галлюцинационный контракт harness OfferKP (retrieve → constrain → verify → abstain).
 * Источник: retrieve-constrain-verify-abstain + CRAG + weakest-claim gate.
 */

const ABSTAIN_MESSAGE =
  "Недостаточно подтверждённых данных в каталоге, чтобы уверенно ответить. Уточните позиции или пришлите заявку с DIN/ГОСТ — без выдуманных цен и наличия.";

const INSUFFICIENT_EVIDENCE_TOKEN = "INSUFFICIENT_EVIDENCE";

/** @type {Record<string, number>} */
const DEFAULT_THRESHOLDS = Object.freeze({
  cragOk: 0.45,
  cragBad: 0.12,
  maxCragHops: 2,
  minCatalogBlocks: 1,
  priceTolerance: 0.02,
  pdfInquiryMinGrade: 0.55,
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
    pdfInquiryMinGrade: num(
      "OFFER_KP_PDF_INQUIRY_MIN_GRADE",
      DEFAULT_THRESHOLDS.pdfInquiryMinGrade
    ),
  };
}

/** Retrieve: только факты из подставленного каталога. */
const RETRIEVE_GUIDELINES = [
  "Retrieve: цены, SKU, наличие и наименования — только из блоков [Каталог · purolat.com] или PDF в контексте. Внешние знания модели для фактов запрещены.",
  "Если каталог не подставлен — не угадывай цены; сообщи, что данных нет, или попроси уточнить позиции (без выдуманных сумм).",
];

/** Constrain: генерация строго по контексту; при PDF-заявке — позиции из файла, цены из каталога. */
const CONSTRAIN_GUIDELINES = [
  "Constrain: цены и наличие в КП — из [Каталог · purolat.com]; наименования и количества — из PDF-заявки в контексте.",
  "Если прикреплён PDF с позициями — формируй КП по нему; не отказывай из-за малого числа блоков каталога, пока идёт подбор.",
  "Не выдумывай цены: при отсутствии совпадения в каталоге укажи «под заказ» или «требует проверки», а не произвольную сумму.",
];

/** Abstain: только при полном отсутствии и PDF, и каталога. */
const ABSTAIN_GUIDELINES = [
  `Abstain: отказ «${ABSTAIN_MESSAGE}» — только если нет ни PDF-заявки, ни блоков каталога.`,
  "При PDF с позициями и ценами продолжай КП: каталог может догрузиться на следующем шаге.",
];

/** Verify: построчная проверка (weakest claim), не среднее. */
const VERIFY_GUIDELINES = [
  "Verify: перед DOCX/PDF проверь каждую строку таблицы — кол-во × цена = сумма; цена из каталога; без формул и плейсхолдеров.",
  "Одна неподтверждённая строка — исправь или убери её; не отправляй документ с выдуманными позициями.",
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
