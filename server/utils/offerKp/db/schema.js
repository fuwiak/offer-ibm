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
};

module.exports = {
  TABLES,
  ENRICH_TABLES,
  PRODUCT_COLUMNS,
  CATEGORY_COLUMNS,
  SKU_COLUMNS,
};
