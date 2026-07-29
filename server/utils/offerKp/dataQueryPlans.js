"use strict";

/**
 * Allowlisted deterministic ShopDB query plans for data_question intents.
 * No LLM SQL — fixed SQL + fixed render (AUDYT_PIPELINE_RU §8.3).
 */

const { query, isShopDbConfigured } = require("./db/client");
const {
  TABLES,
  PRODUCT_COLUMNS: P,
  CATEGORY_COLUMNS: C,
  SKU_COLUMNS: S,
} = require("./db/schema");

/** @typedef {{ id: string, match: (text: string) => boolean, run: (text?: string) => Promise<object>, render: (result: object) => string }} DataQueryPlan */

/** @type {DataQueryPlan[]} */
const PLANS = [
  {
    id: "COUNT_ACTIVE_PRODUCTS",
    match: (t) =>
      /(?:сколько|какое\s+количество|ile|how\s+many).{0,40}(?:товар|продукт|позиц|product)/iu.test(
        t
      ) &&
      /(?:каталог|баз|shopdb|purolat|catalog)/iu.test(t) &&
      !/(?:без\s+цен|дубликат|категор)/iu.test(t),
    async run() {
      const rows = await query(
        `SELECT COUNT(*) AS cnt FROM ${TABLES.product} WHERE ${P.status} = 1`
      );
      return { count: Number(rows?.[0]?.cnt || 0) };
    },
    render(r) {
      return `В активном каталоге ShopDB: **${r.count}** товаров (status=1).`;
    },
  },
  {
    id: "COUNT_PRODUCTS",
    match: (t) =>
      !/(?:без\s+цен|без\s+цены|дубликат)/iu.test(t) &&
      (/(?:сколько|какое\s+количество).{0,40}(?:строк|запис).{0,30}(?:каталог|shopdb|баз)/iu.test(
        t
      ) ||
        /(?:всего|общее\s+число).{0,30}(?:товар|продукт).{0,30}(?:каталог|баз)/iu.test(
          t
        )),
    async run() {
      const rows = await query(`SELECT COUNT(*) AS cnt FROM ${TABLES.product}`);
      return { count: Number(rows?.[0]?.cnt || 0) };
    },
    render(r) {
      return `Всего строк в таблице товаров ShopDB: **${r.count}**.`;
    },
  },
  {
    id: "LIST_CATEGORIES",
    match: (t) =>
      /(?:какие|список|what|jakie).{0,35}(?:категор|categor)/iu.test(t) ||
      /(?:категор).{0,40}(?:есть|в\s+баз|в\s+каталог|list)/iu.test(t),
    async run() {
      const rows = await query(
        `SELECT c.${C.id} AS id, c.${C.name} AS name,
                (SELECT COUNT(*) FROM ${TABLES.product} p
                 WHERE p.${P.categoryId} = c.${C.id} AND p.${P.status} = 1) AS products
         FROM ${TABLES.category} c
         WHERE c.${C.status} = 1
         ORDER BY products DESC, c.${C.name} ASC
         LIMIT 40`
      );
      return { categories: rows || [] };
    },
    render(r) {
      const lines = (r.categories || []).map(
        (c, i) =>
          `${i + 1}. ${c.name} — ${Number(c.products) || 0} товар(ов)`
      );
      if (!lines.length) return "Активных категорий в ShopDB не найдено.";
      return `Категории каталога (топ до 40):\n${lines.join("\n")}`;
    },
  },
  {
    id: "COUNT_BY_CATEGORY",
    match: (t) =>
      /(?:сколько|распредел|групп).{0,40}(?:по\s+категор|категор)/iu.test(t),
    async run() {
      const rows = await query(
        `SELECT c.${C.name} AS name, COUNT(*) AS cnt
         FROM ${TABLES.product} p
         LEFT JOIN ${TABLES.category} c
           ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
         WHERE p.${P.status} = 1
         GROUP BY c.${C.id}, c.${C.name}
         ORDER BY cnt DESC
         LIMIT 25`
      );
      return { rows: rows || [] };
    },
    render(r) {
      const lines = (r.rows || []).map(
        (row, i) =>
          `${i + 1}. ${row.name || "без категории"} — ${Number(row.cnt) || 0}`
      );
      return `Товары по категориям:\n${lines.join("\n") || "нет данных"}`;
    },
  },
  {
    id: "COUNT_SKUS_WITHOUT_PRICE",
    match: (t) =>
      /(?:без\s+цен|без\s+цены|нулев\w*\s+цен|price\s*=\s*0|без\s+стоим)/iu.test(
        t
      ) && /(?:sku|артикул|строк|товар|shopdb|каталог|баз)/iu.test(t),
    async run() {
      const rows = await query(
        `SELECT COUNT(*) AS cnt FROM ${TABLES.productSkus}
         WHERE COALESCE(${S.price}, 0) <= 0`
      );
      return { count: Number(rows?.[0]?.cnt || 0) };
    },
    render(r) {
      return `SKU без цены (price ≤ 0): **${r.count}**.`;
    },
  },
  {
    id: "COUNT_DUPLICATE_SKUS",
    match: (t) =>
      /(?:дубликат|повтор|duplicate).{0,30}(?:sku|артикул)/iu.test(t) ||
      /(?:есть\s+ли).{0,20}(?:дубликат|повтор).{0,20}(?:sku|артикул)/iu.test(t),
    async run() {
      const rows = await query(
        `SELECT ${S.sku} AS sku, COUNT(*) AS cnt
         FROM ${TABLES.productSkus}
         WHERE ${S.sku} IS NOT NULL AND TRIM(${S.sku}) <> ''
         GROUP BY ${S.sku}
         HAVING COUNT(*) > 1
         ORDER BY cnt DESC
         LIMIT 20`
      );
      return { duplicates: rows || [] };
    },
    render(r) {
      const dups = r.duplicates || [];
      if (!dups.length) return "Дубликатов SKU в каталоге не найдено.";
      const lines = dups.map(
        (d, i) => `${i + 1}. ${d.sku} — ${Number(d.cnt)} раз`
      );
      return `Найдено дублирующихся SKU (топ 20):\n${lines.join("\n")}`;
    },
  },
  {
    id: "MIN_MAX_AVG_PRICE",
    match: (t) =>
      /(?:средн|мин|макс|min|max|avg).{0,30}(?:цен|price)/iu.test(t) ||
      /(?:диапазон|разброс).{0,20}цен/iu.test(t),
    async run() {
      const rows = await query(
        `SELECT
           MIN(${S.price}) AS min_price,
           MAX(${S.price}) AS max_price,
           AVG(${S.price}) AS avg_price,
           COUNT(*) AS cnt
         FROM ${TABLES.productSkus}
         WHERE COALESCE(${S.price}, 0) > 0`
      );
      const row = rows?.[0] || {};
      return {
        min: Number(row.min_price) || 0,
        max: Number(row.max_price) || 0,
        avg: Number(row.avg_price) || 0,
        count: Number(row.cnt) || 0,
      };
    },
    render(r) {
      return (
        `Цены SKU (price > 0), n=${r.count}:\n` +
        `- min: **${r.min.toFixed(2)}**\n` +
        `- max: **${r.max.toFixed(2)}**\n` +
        `- avg: **${r.avg.toFixed(2)}**`
      );
    },
  },
  {
    id: "TOP_BY_PRICE",
    match: (t) =>
      !/(?:аналог|вместо|подбер|найди|ищу)/iu.test(t) &&
      (/(?:самый|наиболее).{0,20}(?:дорог|дешев)/iu.test(t) ||
        /(?:top|топ).{0,20}(?:по\s+цен|дорог)/iu.test(t) ||
        /most\s+expensive|cheapest/iu.test(t)),
    async run(text = "") {
      const cheapest = /(?:дешев|cheap|cheapest)/iu.test(text);
      const order = cheapest ? "ASC" : "DESC";
      const rows = await query(
        `SELECT p.${P.id} AS id, p.${P.name} AS name, s.${S.sku} AS sku, s.${S.price} AS price
         FROM ${TABLES.productSkus} s
         INNER JOIN ${TABLES.product} p ON p.${P.id} = s.${S.productId}
         WHERE p.${P.status} = 1 AND COALESCE(s.${S.price}, 0) > 0
         ORDER BY s.${S.price} ${order}
         LIMIT 5`
      );
      return { cheapest, products: rows || [] };
    },
    render(r) {
      const label = r.cheapest ? "Самые дешёвые" : "Самые дорогие";
      const lines = (r.products || []).map(
        (p, i) =>
          `${i + 1}. ${p.name} — ${Number(p.price).toFixed(2)} (SKU ${p.sku || "—"})`
      );
      if (!lines.length) return "Товары с ценой не найдены.";
      return `${label} позиции каталога:\n${lines.join("\n")}`;
    },
  },
  {
    id: "CATALOG_OVERVIEW",
    match: (t) =>
      /(?:расскажи|опиши|overview).{0,40}(?:каталог|данн|shopdb|баз)/iu.test(
        t
      ) ||
      /what\s+products\s+are\s+in\s+the\s+catalog/iu.test(t) ||
      /ile\s+produkt/iu.test(t),
    async run() {
      const [active, cats, priced] = await Promise.all([
        query(
          `SELECT COUNT(*) AS cnt FROM ${TABLES.product} WHERE ${P.status} = 1`
        ),
        query(
          `SELECT COUNT(*) AS cnt FROM ${TABLES.category} WHERE ${C.status} = 1`
        ),
        query(
          `SELECT COUNT(*) AS cnt FROM ${TABLES.productSkus} WHERE COALESCE(${S.price}, 0) > 0`
        ),
      ]);
      return {
        products: Number(active?.[0]?.cnt || 0),
        categories: Number(cats?.[0]?.cnt || 0),
        skusWithPrice: Number(priced?.[0]?.cnt || 0),
      };
    },
    render(r) {
      return (
        `Кратко по ShopDB (purolat.com):\n` +
        `- активных товаров: **${r.products}**\n` +
        `- активных категорий: **${r.categories}**\n` +
        `- SKU с ценой > 0: **${r.skusWithPrice}**\n` +
        `Уточните: категории, дубликаты SKU, min/max цену или товар по DIN/ГОСТ.`
      );
    },
  },
];

/**
 * @param {string} message
 * @returns {DataQueryPlan|null}
 */
function resolveDataQueryPlan(message = "") {
  const text = String(message || "").trim();
  if (!text) return null;
  for (const plan of PLANS) {
    if (plan.match(text)) return plan;
  }
  return null;
}

/**
 * @param {string} message
 * @returns {Promise<{ planId: string, text: string, result: object, mode: string }|null>}
 */
async function executeDataQuestion(message = "") {
  if (!isShopDbConfigured()) return null;
  const plan = resolveDataQueryPlan(message);
  if (!plan) return null;
  const result = await plan.run(String(message || ""));
  return {
    planId: plan.id,
    text: plan.render(result),
    result,
    mode: "deterministic_render",
  };
}

module.exports = {
  PLANS,
  resolveDataQueryPlan,
  executeDataQuestion,
};
