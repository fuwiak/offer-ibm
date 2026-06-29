"use strict";

/**
 * Подбор товаров по сходству названий: TF-IDF + cosine, дополнение Levenshtein/Jaro-Winkler.
 * Используется как fallback, когда точного совпадения в MySQL-каталоге нет.
 */

const fastLevenshtein = require("fast-levenshtein");
const { query } = require("./db/client");
const { resolveProductPrice } = require("./priceResolve");
const { normalizeSearchText, foldHomoglyphs } = require("./textNormalize");
const {
  TABLES,
  PRODUCT_COLUMNS: P,
  CATEGORY_COLUMNS: C,
} = require("./db/schema");

const PRODUCT_SELECT = `
  p.${P.id} AS id,
  p.${P.name} AS name,
  p.${P.summary} AS summary,
  p.${P.description} AS description,
  p.${P.price} AS price,
  p.${P.currency} AS currency,
  p.${P.url} AS product_url,
  c.${C.name} AS category_name,
  c.${C.fullUrl} AS category_url
`;

const DEFAULT_MIN_COSINE = Number(
  process.env.SHOP_DB_NAME_SIMILARITY_MIN || 0.32
);
const SIMILAR_PAIR_THRESHOLD = Number(
  process.env.SHOP_DB_SIMILAR_PAIR_THRESHOLD || 0.82
);
const SCORE_TIE_GAP = Number(process.env.SHOP_DB_SIMILAR_SCORE_GAP || 12);

const NAME_STOPWORDS = new Set([
  "для",
  "the",
  "and",
  "или",
  "как",
  "какой",
  "какая",
  "какие",
  "цена",
  "цену",
  "стоимость",
  "купить",
  "нужен",
  "нужна",
  "нужно",
]);

function sqlLimit(limit) {
  return Math.max(1, Math.min(200, parseInt(limit, 10) || 5));
}

function tokenize(text) {
  return normalizeSearchText(foldHomoglyphs(text))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !NAME_STOPWORDS.has(t));
}

function buildTermFrequency(tokens) {
  const tf = {};
  const len = tokens.length || 1;
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1 / len;
  }
  return tf;
}

function computeIdf(documents) {
  const n = documents.length || 1;
  const df = {};
  for (const doc of documents) {
    for (const term of new Set(doc)) {
      df[term] = (df[term] || 0) + 1;
    }
  }
  const idf = {};
  for (const [term, count] of Object.entries(df)) {
    idf[term] = Math.log((n + 1) / (count + 1)) + 1;
  }
  return idf;
}

function tfidfVector(tokens, idf) {
  const tf = buildTermFrequency(tokens);
  const vec = {};
  for (const [term, weight] of Object.entries(tf)) {
    vec[term] = weight * (idf[term] || 1);
  }
  return vec;
}

function cosineSimilarity(vecA, vecB) {
  const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const key of keys) {
    const a = vecA[key] || 0;
    const b = vecB[key] || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizedLevenshtein(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right) return 0;
  const maxLen = Math.max(left.length, right.length, 1);
  return 1 - fastLevenshtein.get(left, right) / maxLen;
}

function jaroWinkler(s1, s2) {
  const a = String(s1 || "");
  const b = String(s2 || "");
  if (!a || !b) return 0;
  if (a === b) return 1;

  const matchDistance = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / a.length +
      matches / b.length +
      (matches - transpositions / 2) / matches) /
    3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Комбинированный score сходства названий (0..1).
 * @param {string} queryText
 * @param {string} productName
 * @returns {number}
 */
function nameSimilarityScore(queryText, productName) {
  const qTokens = tokenize(queryText);
  const pTokens = tokenize(productName);
  if (!qTokens.length || !pTokens.length) return 0;

  const idf = computeIdf([qTokens, pTokens]);
  const cosine = cosineSimilarity(
    tfidfVector(qTokens, idf),
    tfidfVector(pTokens, idf)
  );

  const qCompact = qTokens.join("");
  const pCompact = pTokens.join("");
  const lev = normalizedLevenshtein(qCompact, pCompact);
  const jw = jaroWinkler(qCompact, pCompact);

  return Math.max(cosine, cosine * 0.55 + lev * 0.25 + jw * 0.2);
}

function productDisplayName(product) {
  return String(product?.name || product || "").trim();
}

function productPrice(product) {
  return resolveProductPrice(product);
}

function productsAreSimilar(a, b, threshold = SIMILAR_PAIR_THRESHOLD) {
  const left = productDisplayName(a);
  const right = productDisplayName(b);
  if (!left || !right) return false;
  return nameSimilarityScore(left, right) >= threshold;
}

/**
 * Из группы похожих товаров выбирает самый дешёвый.
 * @param {object[]} products
 * @param {{ pairThreshold?: number, getPrice?: (p: object) => number }} [options]
 * @returns {object|null}
 */
function pickCheaperAmongSimilar(products, options = {}) {
  const list = (products || []).filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];

  const pairThreshold = options.pairThreshold ?? SIMILAR_PAIR_THRESHOLD;
  const getPrice = options.getPrice || productPrice;

  const clusters = [];
  for (const product of list) {
    let placed = false;
    for (const cluster of clusters) {
      if (
        cluster.some((other) =>
          productsAreSimilar(product, other, pairThreshold)
        )
      ) {
        cluster.push(product);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([product]);
  }

  const multi = clusters.filter((c) => c.length > 1);
  if (!multi.length) {
    return [...list].sort((a, b) => getPrice(a) - getPrice(b))[0];
  }

  const cheapestPerCluster = multi.map(
    (cluster) =>
      [...cluster].sort((a, b) => {
        const priceDiff = getPrice(a) - getPrice(b);
        if (priceDiff !== 0) return priceDiff;
        return productDisplayName(a).localeCompare(productDisplayName(b));
      })[0]
  );

  return cheapestPerCluster.sort((a, b) => getPrice(a) - getPrice(b))[0];
}

/**
 * При близких score ранжирования предпочитает более дешёвый среди похожих названий.
 * @param {Array<{ p: object, score: number, index: number }>} scored
 * @param {{ scoreGap?: number, pairThreshold?: number, getPrice?: (p: object) => number }} [options]
 * @returns {object[]}
 */
function applyCheaperPreferenceAmongSimilar(scored, options = {}) {
  const scoreGap = options.scoreGap ?? SCORE_TIE_GAP;
  const getPrice = options.getPrice || ((p) => productPrice(p.p || p));
  const items = [...(scored || [])];
  if (items.length <= 1) return items.map((s) => s.p);

  items.sort((a, b) => b.score - a.score || a.index - b.index);

  const out = [];
  let i = 0;
  while (i < items.length) {
    const group = [items[i]];
    let j = i + 1;
    while (j < items.length && items[i].score - items[j].score <= scoreGap) {
      group.push(items[j]);
      j++;
    }

    if (group.length > 1) {
      let similarCluster = null;
      for (let a = 0; a < group.length && !similarCluster; a++) {
        const cluster = [group[a]];
        for (let b = a + 1; b < group.length; b++) {
          if (
            productsAreSimilar(group[a].p, group[b].p, options.pairThreshold)
          ) {
            if (!cluster.includes(group[b])) cluster.push(group[b]);
          }
        }
        if (cluster.length > 1) similarCluster = cluster;
      }

      if (similarCluster?.length > 1) {
        const cheapest = pickCheaperAmongSimilar(
          similarCluster.map((s) => s.p),
          options
        );
        const cheapestId = cheapest?.id;
        const reordered = [...group].sort((a, b) => {
          if (a.p?.id === cheapestId) return -1;
          if (b.p?.id === cheapestId) return 1;
          const priceDiff = getPrice(a) - getPrice(b);
          if (priceDiff !== 0) return priceDiff;
          return b.score - a.score || a.index - b.index;
        });
        out.push(...reordered);
      } else {
        out.push(...group);
      }
    } else {
      out.push(group[0]);
    }
    i = j;
  }

  return out.map((s) => s.p);
}

function rankProductsByNameSimilarity(
  queryText,
  products,
  minScore = DEFAULT_MIN_COSINE
) {
  return (products || [])
    .map((p, index) => ({
      p,
      score: nameSimilarityScore(queryText, p.name || ""),
      index,
    }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function mapSearchRows(rows, matchSource) {
  const tables = [TABLES.product, TABLES.category];
  return rows.map((r) => ({
    ...r,
    _tables: tables,
    _matchSources: [matchSource],
    shopDbTables: tables,
    shopMatchSources: [matchSource],
    _nameSimilarity: r._nameSimilarity ?? null,
  }));
}

async function fetchNameSimilarityCandidatePool(
  searchText,
  terms = [],
  limit = 120
) {
  const params = [];
  const likes = [];
  const tokenList = [
    ...new Set([
      ...tokenize(searchText),
      ...(terms || [])
        .map((t) => String(t).toLowerCase())
        .filter((t) => t.length >= 3),
    ]),
  ].slice(0, 10);

  if (tokenList.length) {
    for (const term of tokenList) {
      params.push(`%${term}%`);
      likes.push(`(p.${P.name} LIKE ? OR p.${P.summary} LIKE ?)`);
      params.push(`%${term}%`);
    }
  }

  const whereClause = likes.length
    ? `p.${P.status} = 1 AND (${likes.join(" OR ")})`
    : `p.${P.status} = 1`;

  const sql = `
    SELECT ${PRODUCT_SELECT}, 'name_cosine_pool' AS match_source
    FROM ${TABLES.product} p
    LEFT JOIN ${TABLES.category} c
      ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
    WHERE ${whereClause}
    ORDER BY p.${P.totalSales} DESC, p.${P.id} DESC
    LIMIT ${sqlLimit(limit)}
  `;

  const rows = await query(sql, params);
  return mapSearchRows(rows, "name_cosine_pool");
}

/**
 * Поиск по косинусному сходству названий в пуле кандидатов из БД.
 * @returns {Promise<object[]>}
 */
async function searchByNameSimilarity(searchText, terms = [], limit = 10) {
  const pool = await fetchNameSimilarityCandidatePool(
    searchText,
    terms,
    Math.max(limit * 8, 80)
  );
  if (!pool.length) return [];

  const ranked = rankProductsByNameSimilarity(searchText, pool);
  const withMeta = ranked.map((row) => ({
    ...row.p,
    _nameSimilarity: Number(row.score.toFixed(4)),
    _matchSources: [
      ...new Set([
        ...(row.p._matchSources || row.p.shopMatchSources || []),
        "name_cosine",
      ]),
    ],
    shopMatchSources: [
      ...new Set([...(row.p.shopMatchSources || []), "name_cosine"]),
    ],
  }));

  const deduped = applyCheaperPreferenceAmongSimilar(
    withMeta.map((p, index) => ({
      p,
      score: (p._nameSimilarity || 0) * 100,
      index,
    }))
  );

  return deduped.slice(0, sqlLimit(limit));
}

module.exports = {
  DEFAULT_MIN_COSINE,
  SIMILAR_PAIR_THRESHOLD,
  SCORE_TIE_GAP,
  tokenize,
  cosineSimilarity,
  nameSimilarityScore,
  productsAreSimilar,
  pickCheaperAmongSimilar,
  applyCheaperPreferenceAmongSimilar,
  rankProductsByNameSimilarity,
  searchByNameSimilarity,
  fetchNameSimilarityCandidatePool,
};
