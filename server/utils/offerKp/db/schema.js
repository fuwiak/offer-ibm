/**
 * Карта таблиц каталога purolat (Webasyst Shop-Script).
 */

const TABLES = {
  product: "shop_product",
  category: "shop_category",
  productParams: "shop_product_params",
  productFeatures: "shop_product_features",
  feature: "shop_feature",
  featureValueVarchar: "shop_feature_values_varchar",
  productSkus: "shop_product_skus",
  searchWord: "shop_search_word",
  searchIndex: "shop_search_index",
  siteDomain: "site_domain",
};

/** Все таблицы, которые может затронуть enrich */
const ENRICH_TABLES = [
  TABLES.product,
  TABLES.category,
  TABLES.productSkus,
  TABLES.searchWord,
  TABLES.searchIndex,
  TABLES.productFeatures,
  TABLES.feature,
  TABLES.featureValueVarchar,
];

const PRODUCT_COLUMNS = {
  id: "id",
  name: "name",
  summary: "summary",
  description: "description",
  url: "url",
  price: "price",
  currency: "currency",
  status: "status",
  categoryId: "category_id",
  totalSales: "total_sales",
};

const CATEGORY_COLUMNS = {
  id: "id",
  name: "name",
  fullUrl: "full_url",
  status: "status",
};

const SKU_COLUMNS = {
  productId: "product_id",
  sku: "sku",
  name: "name",
  price: "price",
  comparePrice: "compare_price",
  count: "count",
  available: "available",
  sort: "sort",
};

const SEARCH_INDEX_COLUMNS = {
  wordId: "word_id",
  productId: "product_id",
  weight: "weight",
};

const SEARCH_WORD_COLUMNS = {
  id: "id",
  name: "name",
};

const FEATURE_COLUMNS = {
  productId: "product_id",
  featureId: "feature_id",
  featureValueId: "feature_value_id",
  featureName: "name",
  featureValue: "value",
};

/**
 * Минимальные требования к схеме MySQL для enrich → contextTexts → LLM.
 * Проверяется validateShopDbSchema() и jest-тестами.
 */
const SCHEMA_REQUIREMENTS = {
  [TABLES.product]: Object.values(PRODUCT_COLUMNS),
  [TABLES.category]: Object.values(CATEGORY_COLUMNS),
  [TABLES.productSkus]: Object.values(SKU_COLUMNS),
  [TABLES.searchWord]: Object.values(SEARCH_WORD_COLUMNS),
  [TABLES.searchIndex]: Object.values(SEARCH_INDEX_COLUMNS),
  [TABLES.productFeatures]: [
    FEATURE_COLUMNS.productId,
    FEATURE_COLUMNS.featureId,
    FEATURE_COLUMNS.featureValueId,
  ],
  [TABLES.feature]: ["id", FEATURE_COLUMNS.featureName],
  [TABLES.featureValueVarchar]: ["id", FEATURE_COLUMNS.featureValue],
};

/** Поля, обязательные в блоке [Каталог · …] для ответа LLM о цене */
const LLM_CONTEXT_MARKERS = {
  catalogPrefix: "[Каталог ·",
  priceLabel: "Цена:",
  productIdLabel: "ID товара",
  linkLabel: "Ссылка:",
};

module.exports = {
  TABLES,
  ENRICH_TABLES,
  PRODUCT_COLUMNS,
  CATEGORY_COLUMNS,
  SKU_COLUMNS,
  SEARCH_INDEX_COLUMNS,
  SEARCH_WORD_COLUMNS,
  FEATURE_COLUMNS,
  SCHEMA_REQUIREMENTS,
  LLM_CONTEXT_MARKERS,
};
