/**
 * Брендинг коммерческих предложений purolat.com (OfferKP).
 * Переопределение через env: OFFER_KP_QUOTE_* , SHOP_BASE_URL.
 */
const QUOTE_BRAND = {
  companyName: process.env.OFFER_KP_QUOTE_COMPANY_NAME || "МКТ «Пуролат»",
  /** Latin labels for PDF (Helvetica / WinAnsi cannot render Cyrillic). */
  companyNameLatin: process.env.OFFER_KP_QUOTE_COMPANY_NAME_LATIN || "Purolat",
  tagline: "Крепёж и метизы — интернет-магазин",
  taglineLatin: "Fasteners and metalware e-shop",
  website: (process.env.SHOP_BASE_URL || "https://purolat.com").replace(
    /\/$/,
    ""
  ),
  catalogLabel: "purolat.com",
  address: process.env.OFFER_KP_QUOTE_ADDRESS || "Saint Petersburg, Russia",
  email: process.env.OFFER_KP_QUOTE_EMAIL || "info@purolat.com",
  phone: process.env.OFFER_KP_QUOTE_PHONE || "",
  referencePrefix: process.env.OFFER_KP_QUOTE_REF_PREFIX || "PUR",
  defaultReference: "PUR-0000",
  defaultContact: {
    name: process.env.OFFER_KP_QUOTE_CONTACT_NAME || "Sales department",
    email: process.env.OFFER_KP_QUOTE_EMAIL || "info@purolat.com",
    phone: process.env.OFFER_KP_QUOTE_PHONE || "",
  },
  terms: [
    "1. GOODS — Items from purolat.com catalog (fasteners, metalware). Stock and prices valid on quote date.",
    "2. SPECIFICATION — Buyer must verify DIN/GOST, diameter, length and qty before order confirmation.",
    "3. DELIVERY — Terms agreed separately; carriage per carrier rates.",
    "4. PAYMENT — Per agreement with sales (prepayment / credit for legal entities).",
  ],
  termsDocx: [
    "1. ТОВАР — позиции из каталога purolat.com (крепёж, метизы). Наличие и цены на дату оферты.",
    "2. СПЕЦИФИКАЦИЯ — проверьте DIN/ГОСТ, диаметр, длину и количество до подтверждения заказа.",
    "3. ДОСТАВКА — условия и сроки согласуются отдельно.",
    "4. ОПЛАТА — по согласованию с менеджером purolat.com.",
  ],
  warrantyNote: "Certified products. Warranty per manufacturer documentation.",
  warrantyNoteDocx:
    "Сертифицированная продукция. Гарантия — согласно паспорту изготовителя.",
  footerLine: "PUROLAT · purolat.com · Fasteners and metalware",
};

/** Country → currency / VAT for quote totals. */
function localeForCountry(country = "") {
  const c = String(country).trim().toLowerCase();
  if (["poland", "polska", "pologne", "pl"].includes(c)) {
    return { currency: "PLN", locale: "pl-PL", vatRate: 0.23 };
  }
  if (["russia", "россия", "rossiya", "ru", "rf"].includes(c)) {
    return { currency: "RUB", locale: "ru-RU", vatRate: 0.2 };
  }
  return { currency: "RUB", locale: "ru-RU", vatRate: 0.2 };
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
