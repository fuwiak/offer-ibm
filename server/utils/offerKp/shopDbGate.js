"use strict";

const SHOP_DB_GATE_MESSAGES = {
  DB_UNAVAILABLE:
    "Каталог ShopDB временно недоступен. Подбор товара, SKU и цены остановлен; ответ из общих знаний модели не формируется.",
  INDEX_NOT_READY:
    "Индекс каталога ShopDB ещё не готов. Подбор товара, SKU и цены остановлен до завершения синхронизации.",
  NO_MATCH:
    "В ShopDB не найден подтверждённый товар по этому запросу. SKU, цена и ссылка не подставлялись.",
};

function gateCodeFromFlags(flags = {}) {
  return (
    flags.shopDbGateCode ||
    (flags.shopDbUnavailable ? "DB_UNAVAILABLE" : null) ||
    (flags.shopDbIndexNotReady ? "INDEX_NOT_READY" : null) ||
    (flags.shopDbNoMatch ? "NO_MATCH" : null)
  );
}

function shopDbGateFailure(flags = {}) {
  const code = gateCodeFromFlags(flags);
  if (!code) return null;
  return {
    code,
    text: SHOP_DB_GATE_MESSAGES[code] || SHOP_DB_GATE_MESSAGES.DB_UNAVAILABLE,
    readiness: flags.shopDbReadiness || null,
  };
}

function findShopDbGateFailure(externalContexts = []) {
  const shop = (externalContexts || []).find((ctx) => ctx?.kind === "shopdb");
  return shopDbGateFailure(shop?.flags || {});
}

module.exports = {
  SHOP_DB_GATE_MESSAGES,
  gateCodeFromFlags,
  shopDbGateFailure,
  findShopDbGateFailure,
};
