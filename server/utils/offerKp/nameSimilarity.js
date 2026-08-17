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
const {
  EMBEDDING_WEIGHT,
  computeEmbeddingSimilarities,
} = require("./embeddingSimilarity");
const {
  canonicalTextForProduct,
  denseTopK,
  embeddingModel,
  getCanonicalCatalogMap,
  getCanonicalCatalogRecords,
  scheduleCanonicalCatalogSync,
  searchCanonicalCatalogDense,
  signatureForProduct,
} = require("./canonicalCatalogIndex");
const { canonicalEmbeddingCacheKey } = require("./canonicalProductText");
const {
  buildQuerySignature,
  signatureHardConflicts,
  signaturesMatchForPricing,
} = require("./canonicalProductText");
const { reciprocalRankFusion } = require("./retrievalFusion");
const { classifyProductMatch } = require("./analogRules");
const { getShopDbBm25Index, topK: bm25TopK } = require("./shopDbBm25Index");

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
// A candidate with weak/zero lexical overlap can still surface on embedding
// similarity alone (paraphrase, synonym, OCR-mangled wording) — but the bar
// is higher than the blended threshold below, since there's no lexical
// corroboration backing it up.
const EMBEDDING_STANDALONE_MIN = Number(
  process.env.SHOP_DB_EMBEDDING_STANDALONE_MIN || 0.62
);

function denseRescueTopK() {
  // Dense is an independent RRF leg — keep it wide enough that recall@100
  // is not capped by a tiny ANN shortlist (was 10 → missed catalog hits).
  return Math.max(
    1,
    Math.min(100, parseInt(process.env.SHOP_DB_DENSE_RESCUE_TOP_K, 10) || 80)
  );
}

function compatibleCandidateLimit() {
  return Math.max(
    1,
    Math.min(100, parseInt(process.env.SHOP_DB_RRF_COMPATIBLE_LIMIT, 10) || 90)
  );
}

function analogCandidateLimit() {
  return Math.max(
    0,
    Math.min(15, parseInt(process.env.SHOP_DB_RRF_ANALOG_LIMIT, 10) || 10)
  );
}

function hasStructuredMatchSource(product) {
  const sources = product?.shopMatchSources || product?._matchSources;
  if (!sources) return false;
  if (sources instanceof Set) {
    return sources.has("structured") || sources.has("elastic");
  }
  return (
    Array.isArray(sources) &&
    (sources.includes("structured") || sources.includes("elastic"))
  );
}

function applyCatalogCandidateQuota(searchText, products, limit = 50) {
  const window = sqlLimit(limit);
  const compatible = [];
  const analogs = [];

  for (const product of products || []) {
    if (!product || typeof product !== "object") continue;
    if (product._exactSku || product.shopMatchSources?.includes("exact_sku")) {
      compatible.push(product);
      continue;
    }
    const classification = classifyProductMatch(searchText, product);
    if (classification.matchType === "analog") {
      const disallowedHard = (product._signatureHard || []).filter(
        (field) => field !== "standardFamily"
      );
      if (!disallowedHard.length) {
        analogs.push({
          ...product,
          _retrievalMatchType: "analog",
          _analogOf: classification.analogOf || null,
        });
      }
      continue;
    }
    if (
      ["exact", "similar"].includes(classification.matchType) &&
      !(product._signatureHard || []).length
    ) {
      compatible.push({
        ...product,
        _retrievalMatchType: classification.matchType,
      });
    }
  }

  const maxCompatible = Math.min(compatibleCandidateLimit(), window);
  const maxAnalogs = Math.min(
    analogCandidateLimit(),
    Math.max(0, window - maxCompatible)
  );
  const selected = [
    ...compatible.slice(0, maxCompatible),
    ...analogs.slice(0, maxAnalogs),
  ].slice(0, window);
  if (selected.length) return selected;

  // Structured SQL already found DIN+MxL rows. Do not return [] just because
  // classify missed Cyrillic «дин» or 10,9 vs 10.9 — that emptied the UI.
  return (products || [])
    .filter((product) => product && hasStructuredMatchSource(product))
    .slice(0, window);
}

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
  // Prefer structured signature equality when both sides have one — cheaper
  // preference must never cross M10x70 vs M10x80 just because names look alike.
  if (
    signaturesMatchForPricing(
      a?._signature || a?.signature,
      b?._signature || b?.signature
    )
  ) {
    return true;
  }
  const leftSig = a?._signature || a?.signature;
  const rightSig = b?._signature || b?.signature;
  if (leftSig && rightSig) {
    const conflicts = signatureHardConflicts(leftSig, rightSig);
    if (conflicts.length) return false;
  }
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
    // Непохожие SKU: сохраняем порядок вызова (релевантность поиска),
    // а не самый дешёвый из разных размеров.
    return list[0];
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
      score: nameSimilarityScore(
        queryText,
        p._canonicalText || canonicalTextForProduct(p)
      ),
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

async function hydrateCatalogProducts(rankedRows, matchSource) {
  if (!rankedRows.length) return [];
  const ids = rankedRows.map((row) => Number(row.productId));
  const placeholders = ids.map(() => "?").join(",");
  const rows = await query(
    `
      SELECT ${PRODUCT_SELECT}, ? AS match_source
      FROM ${TABLES.product} p
      LEFT JOIN ${TABLES.category} c
        ON c.${C.id} = p.${P.categoryId} AND c.${C.status} = 1
      WHERE p.${P.status} = 1 AND p.${P.id} IN (${placeholders})
    `,
    [matchSource, ...ids]
  );
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  const catalogMap = getCanonicalCatalogMap();
  return rankedRows
    .map((row) => {
      const product = byId.get(Number(row.productId));
      if (!product) return null;
      const catalog = catalogMap.get(Number(row.productId));
      return {
        ...product,
        ...row.meta,
        _canonicalText:
          row.meta?._canonicalText || catalog?.canonicalText || null,
        _signature: row.meta?._signature || catalog?.signature || null,
      };
    })
    .filter(Boolean)
    .map((row) => mapSearchRows([row], matchSource)[0]);
}

async function fetchCanonicalCatalogCandidatePool(searchText, limit = 120) {
  scheduleCanonicalCatalogSync();
  const records = getCanonicalCatalogRecords();
  if (!records.length) return [];

  const ranked = records
    .map((record) => ({
      productId: Number(record.productId),
      score: nameSimilarityScore(searchText, record.canonicalText),
      meta: {
        _canonicalText: record.canonicalText,
        _canonicalSimilarity: null,
      },
      record,
    }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) => b.score - a.score || Number(b.productId) - Number(a.productId)
    )
    .slice(0, sqlLimit(limit))
    .map((row) => ({
      productId: row.productId,
      meta: {
        _canonicalText: row.record.canonicalText,
        _canonicalSimilarity: Number(row.score.toFixed(4)),
      },
    }));
  return hydrateCatalogProducts(ranked, "canonical_catalog");
}

async function fetchBm25CatalogCandidatePool(searchText, limit = bm25TopK()) {
  scheduleCanonicalCatalogSync();
  const records = getCanonicalCatalogRecords();
  const index = getShopDbBm25Index(records);
  if (!index?.count) return [];
  const ranked = index.search(searchText, limit).map((hit) => ({
    productId: Number(hit.productId),
    meta: {
      _canonicalText: hit.record?.canonicalText || null,
      _signature: hit.record?.signature || null,
      _bm25Score: hit.score,
    },
  }));
  return hydrateCatalogProducts(ranked, "catalog_bm25");
}

/**
 * Full-catalog dense ANN (persisted e5 vectors). Independent candidate source —
 * not a price/exact decision. Hydrates live ShopDB rows for price after match.
 */
async function fetchDenseCatalogCandidatePool(searchText, limit = denseTopK()) {
  const hits = await searchCanonicalCatalogDense(searchText, limit);
  if (!hits.length) return [];
  const ranked = hits.map((hit) => ({
    productId: Number(hit.productId),
    meta: {
      _canonicalText: hit.canonicalText,
      _denseSimilarity: hit.score,
      _embeddingSimilarity: hit.score,
    },
  }));
  return hydrateCatalogProducts(ranked, "catalog_dense");
}

/**
 * Dokłada opcjonalny sygnał embeddingowy (semantyczny) do kandydatów z pełnej
 * puli SQL LIKE (nie tylko tych, które już przeszły próg TF-IDF — patrz
 * wywołanie w searchByNameSimilarity). Blend jest addytywny względem
 * istniejącego score — gdy embedding jest wyłączony/niedostępny, funkcja
 * zwraca `products` bez zmian (dokładnie te same obiekty i kolejność co dziś).
 * @param {string} queryText
 * @param {object[]} products - obiekty z już policzonym `_nameSimilarity`
 * @returns {Promise<object[]>}
 */
async function applyEmbeddingBoost(queryText, products) {
  if (!products.length) return products;

  // Dense catalog hits already carry full-catalog cosine — only embed the rest.
  const needEmbed = products.filter((p) => p._embeddingSimilarity == null);
  const similarities = needEmbed.length
    ? await computeEmbeddingSimilarities(
        queryText,
        needEmbed.map((p) => {
          const canonicalText = p._canonicalText || canonicalTextForProduct(p);
          return {
            id: canonicalEmbeddingCacheKey(
              embeddingModel(),
              p.id,
              canonicalText
            ),
            name: canonicalText,
            productId: p.id,
          };
        })
      )
    : new Map();

  return products.map((p) => {
    let embedScore = p._embeddingSimilarity;
    if (embedScore == null) {
      const canonicalText = p._canonicalText || canonicalTextForProduct(p);
      const cacheKey = canonicalEmbeddingCacheKey(
        embeddingModel(),
        p.id,
        canonicalText
      );
      embedScore = similarities.get(cacheKey);
    }
    if (embedScore == null) return p;
    const base = p._nameSimilarity || 0;
    const blended = Math.max(
      base,
      base * (1 - EMBEDDING_WEIGHT) + embedScore * EMBEDDING_WEIGHT
    );
    const fromDense = p._denseSimilarity != null;
    return {
      ...p,
      _nameSimilarity: Number(blended.toFixed(4)),
      _embeddingSimilarity: Number(embedScore.toFixed(4)),
      _matchSources: [
        ...new Set([
          ...(p._matchSources || []),
          fromDense ? "catalog_dense" : "name_embedding",
        ]),
      ],
      shopMatchSources: [
        ...new Set([
          ...(p.shopMatchSources || []),
          fromDense ? "catalog_dense" : "name_embedding",
        ]),
      ],
    };
  });
}

/**
 * Поиск по косинусному сходству названий в пуле кандидатов из БД.
 * Дополнительно (опционально) переранжирует TF-IDF-кандидатов лёгким
 * embedding-сигналом — см. applyEmbeddingBoost / embeddingSimilarity.js.
 * @returns {Promise<object[]>}
 */
async function searchByNameSimilarity(searchText, terms = [], limit = 10) {
  const poolLimit = Math.max(limit * 12, 120);
  const denseLimit = denseRescueTopK();
  const [sqlPool, bm25Pool, densePool] = await Promise.all([
    fetchNameSimilarityCandidatePool(searchText, terms, poolLimit),
    fetchBm25CatalogCandidatePool(searchText, bm25TopK()),
    fetchDenseCatalogCandidatePool(searchText, denseLimit),
  ]);

  // Rank each source independently, then RRF-merge so dense can surface
  // products SQL LIKE never retrieved.
  const sqlRanked = rankProductsByNameSimilarity(searchText, sqlPool, 0).map(
    (row) => row.p
  );
  const bm25Ranked = [...bm25Pool].sort(
    (a, b) =>
      (b._bm25Score || 0) - (a._bm25Score || 0) || Number(a.id) - Number(b.id)
  );
  const denseRanked = [...densePool].sort(
    (a, b) =>
      (b._denseSimilarity || 0) - (a._denseSimilarity || 0) ||
      Number(a.id) - Number(b.id)
  );

  const fused = reciprocalRankFusion([bm25Ranked, denseRanked, sqlRanked], {
    k: 60,
  }).slice(0, poolLimit);

  if (!fused.length) return [];

  // Score the WHOLE fused pool (minScore=0) — paraphrase/synonym can score low
  // on TF-IDF yet still be correct via dense. Filter after embedding blend.
  const ranked = rankProductsByNameSimilarity(searchText, fused, 0);
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

  const boosted = await applyEmbeddingBoost(searchText, withMeta);

  // Survive on EITHER signal: solid lexical score, or strong dense/embedding.
  const survivors = boosted.filter(
    (p) =>
      (p._nameSimilarity || 0) >= DEFAULT_MIN_COSINE ||
      (p._bm25Score || 0) > 0 ||
      (p._embeddingSimilarity || 0) >= EMBEDDING_STANDALONE_MIN ||
      (p._denseSimilarity || 0) >= EMBEDDING_STANDALONE_MIN
  );

  // Attach signatures + mark hard conflicts. Do NOT use price/popularity here —
  // cheapest SKU is chosen later only inside a confirmed exact/analog signature.
  const querySig = buildQuerySignature(searchText);
  const annotated = survivors.map((p) => {
    const signature = p._signature || signatureForProduct(p);
    const hard = signatureHardConflicts(querySig, signature);
    return {
      ...p,
      _signature: signature,
      _signatureHard: hard,
      _matchSources: [
        ...new Set([
          ...(p._matchSources || []),
          ...(hard.length ? ["signature_hard"] : []),
        ]),
      ],
    };
  });

  // Rank by retrieval identity only (BM25 / RRF / dense), then enforce hard
  // technical constraints. Approved standard substitutions are kept in a
  // separate analog bucket capped at 10% of the 50-candidate window.
  const ordered = [...annotated].sort((a, b) => {
    const aHard = a._signatureHard?.length || 0;
    const bHard = b._signatureHard?.length || 0;
    if (aHard !== bHard) return aHard - bHard;
    return (
      (b._rrfScore || 0) - (a._rrfScore || 0) ||
      (b._bm25Score || 0) - (a._bm25Score || 0) ||
      (b._nameSimilarity || 0) - (a._nameSimilarity || 0) ||
      (b._embeddingSimilarity || 0) - (a._embeddingSimilarity || 0) ||
      Number(a.id) - Number(b.id)
    );
  });

  return applyCatalogCandidateQuota(searchText, ordered, limit);
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
  fetchCanonicalCatalogCandidatePool,
  fetchBm25CatalogCandidatePool,
  fetchDenseCatalogCandidatePool,
  denseRescueTopK,
  compatibleCandidateLimit,
  analogCandidateLimit,
  applyCatalogCandidateQuota,
};
