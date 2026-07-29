---
name: Схема ShopDB (кратко)
description: Основные таблицы и поля каталога purolat / Shop-Script для поиска и цен.
triggers: shopdb, schema, таблиц, sku, product_id, каталог
---

# ShopDB schema (кратко)

Код-истина: `server/utils/offerKp/db/schema.js`. Здесь — ориентир для LLM/оператора.

- `shop_product` — товар (id, name, price, status, category_id, url…).
- `shop_product_skus` — артикулы/SKU и складские цены.
- `shop_category` — категории.
- Features — характеристики (DIN/ГОСТ, покрытие, прочность) через feature tables.

Поиск: exact SKU → structured SQL → name TF-IDF + embedding rerank → LLM-fallback.
Цены для КП: только после eligible match + live stock/price resolve.
