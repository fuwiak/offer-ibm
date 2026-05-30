/** Брендинг превью оферты purolat.com (синхронно с server/utils/offerKpApp/quoteBrand.js). */
export const QUOTE_BRAND = {
  companyName: "МКТ «Пуролат»",
  tagline: "Крепёж и метизы — интернет-магазин",
  website: "https://purolat.com",
  catalogLabel: "purolat.com",
  address: "Санкт-Петербург, Россия",
  email: "info@purolat.com",
  phone: "",
  warrantyNote:
    "Сертифицированная продукция от производителей. Гарантия — согласно паспорту изготовителя.",
};

export function localeForCountry(country = "") {
  const c = String(country).trim().toLowerCase();
  if (["poland", "polska", "pologne", "pl"].includes(c)) {
    return { currency: "PLN", locale: "pl-PL", vatRate: 0.23 };
  }
  if (["russia", "россия", "rossiya", "ru", "rf"].includes(c)) {
    return { currency: "RUB", locale: "ru-RU", vatRate: 0.2 };
  }
  return { currency: "RUB", locale: "ru-RU", vatRate: 0.2 };
}
