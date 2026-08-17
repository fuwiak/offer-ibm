/**
 * Брендинг коммерческих предложений purolat.com (OfferKP).
 * Переопределение через env: OFFER_KP_QUOTE_* , SHOP_BASE_URL.
 * Рабочий язык КП — русский (кириллица), без латинской транслитерации.
 */
const QUOTE_BRAND = {
  companyName: process.env.OFFER_KP_QUOTE_COMPANY_NAME || "МКТ «Пуролат»",
  tagline: "Крепёж и метизы — интернет-магазин",
  website: (process.env.SHOP_BASE_URL || "https://purolat.com").replace(
    /\/$/,
    ""
  ),
  catalogLabel: "purolat.com",
  address:
    process.env.OFFER_KP_QUOTE_ADDRESS || "Санкт-Петербург, Россия",
  email: process.env.OFFER_KP_QUOTE_EMAIL || "info@purolat.com",
  phone: process.env.OFFER_KP_QUOTE_PHONE || "",
  referencePrefix: process.env.OFFER_KP_QUOTE_REF_PREFIX || "PUR",
  defaultReference: "PUR-0000",
  defaultContact: {
    name: process.env.OFFER_KP_QUOTE_CONTACT_NAME || "Отдел продаж",
    email: process.env.OFFER_KP_QUOTE_EMAIL || "info@purolat.com",
    phone: process.env.OFFER_KP_QUOTE_PHONE || "",
  },
  terms: [
    "1. ТОВАР — позиции из каталога purolat.com (крепёж, метизы). Наличие и цены на дату оферты.",
    "2. СПЕЦИФИКАЦИЯ — проверьте DIN/ГОСТ, диаметр, длину и количество до подтверждения заказа.",
    "3. ДОСТАВКА — условия и сроки согласуются отдельно.",
    "4. ОПЛАТА — по согласованию с менеджером purolat.com.",
  ],
  warrantyNote:
    "Сертифицированная продукция. Гарантия — согласно паспорту изготовителя.",
  footerLine: "ПУРОЛАТ · purolat.com · Крепёж и метизы",
};
// Aliases kept for DOCX / chat artifacts that still reference *Docx keys
QUOTE_BRAND.termsDocx = QUOTE_BRAND.terms;
QUOTE_BRAND.warrantyNoteDocx = QUOTE_BRAND.warrantyNote;

/** Country → currency / VAT for quote totals. */
function localeForCountry(country = "") {
  const c = String(country).trim().toLowerCase();
  if (["poland", "polska", "pologne", "pl"].includes(c)) {
    return { currency: "PLN", locale: "pl-PL", vatRate: 0 };
  }
  if (["russia", "россия", "rossiya", "ru", "rf"].includes(c)) {
    return { currency: "RUB", locale: "ru-RU", vatRate: 0 };
  }
  return { currency: "RUB", locale: "ru-RU", vatRate: 0 };
}

function makeMoneyFormatter(currency, locale) {
  return (num) => {
    const formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(num) || 0);
    return formatted.replace(/[\u202f\u00a0]/g, " ");
  };
}

module.exports = { QUOTE_BRAND, localeForCountry, makeMoneyFormatter };
