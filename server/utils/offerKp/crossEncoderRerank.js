"use strict";

/**
 * ЭКСПЕРИМЕНТАЛЬНЫЙ cross-encoder reranker поверх уже найденных кандидатов
 * (SQL/TF-IDF/bi-encoder embedding из nameSimilarity.js/embeddingSimilarity.js
 * их не заменяет, а переранжирует то немногое, что они уже нашли).
 *
 * Зачем отдельно от bi-encoder эмбеддинга (embeddingSimilarity.js): bi-encoder
 * кодирует запрос и товар НЕЗАВИСИМО и сравнивает векторы косинусом — из-за
 * этого он плохо различает «похожие, но неверные» варианты (M10x80 vs M10x70,
 * DIN 933 vs DIN 931), потому что оба почти одинаково близки к запросу в
 * векторном пространстве. Cross-encoder читает запрос И кандидата ВМЕСТЕ одним
 * проходом модели — это медленнее (нельзя закэшировать вектор товара заранее),
 * поэтому применяется только к уже небольшому топ-N после retrieval, а не ко
 * всему пулу.
 *
 * Модель: Xenova/bge-reranker-base (XLM-RoBERTa, официальная ONNX-конвертация
 * от Xenova под ту же библиотеку @xenova/transformers, что уже используется
 * для embeddingSimilarity.js) — CPU-only, не трогает GPU/LM Studio/T4.
 *
 * СТАТУС: выключено по умолчанию (SHOP_DB_RERANKER_ENABLED не установлен).
 * Живой прогон в этой сессии подтвердил, что модель качается и считает
 * логиты (см. AUDYT.md §8), но точность на Русском тексте специально не
 * измерялась — прежде чем включать по умолчанию, прогоните
 * scripts/measure-shopdb-search-quality.cjs с SHOP_DB_RERANKER_ENABLED=1
 * и сравните accuracy@1 с baseline.
 */

function envFlagEnabled(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return !["0", "false", "no", "off"].includes(
    String(raw).trim().toLowerCase()
  );
}

const RERANKER_ENABLED = envFlagEnabled("SHOP_DB_RERANKER_ENABLED", false);
const RERANKER_MODEL =
  process.env.SHOP_DB_RERANKER_MODEL || "Xenova/bge-reranker-base";
const MAX_RERANK_CANDIDATES = Math.max(
  1,
  parseInt(process.env.SHOP_DB_RERANKER_MAX_CANDIDATES, 10) || 15
);
// Насколько сильно cross-encoder-скор перевешивает исходный (lexical/embedding)
// ранг при итоговой сортировке — 1 значит "полностью доверяем reranker'у".
const RERANKER_WEIGHT = Math.min(
  1,
  Math.max(0, Number(process.env.SHOP_DB_RERANKER_WEIGHT ?? 0.7))
);

let modelPromise = null;
let disabled = !RERANKER_ENABLED;

async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { AutoTokenizer, AutoModelForSequenceClassification } =
        await import("@xenova/transformers");
      const tokenizer = await AutoTokenizer.from_pretrained(RERANKER_MODEL);
      const model =
        await AutoModelForSequenceClassification.from_pretrained(
          RERANKER_MODEL
        );
      return { tokenizer, model };
    })();
  }
  return modelPromise;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * @param {string} queryText
 * @param {Array<{id: string|number, name: string}>} candidates
 * @returns {Promise<Map<string|number, number>>} productId -> relevance score (0..1)
 */
async function computeRerankScores(queryText, candidates) {
  const text = String(queryText || "").trim();
  if (disabled || !text || !candidates?.length) return new Map();

  const pool = candidates.slice(0, MAX_RERANK_CANDIDATES);

  try {
    const { tokenizer, model } = await loadModel();
    const queries = pool.map(() => text);
    const passages = pool.map((c) => String(c.name || "").trim());

    const inputs = tokenizer(queries, {
      text_pair: passages,
      padding: true,
      truncation: true,
    });
    const { logits } = await model(inputs);
    const scores = logits.tolist().map((row) => sigmoid(row[0]));

    const result = new Map();
    pool.forEach((c, i) => {
      if (c?.id != null) result.set(c.id, scores[i]);
    });
    return result;
  } catch (error) {
    disabled = true;
    console.error(
      "[CrossEncoderRerank] Failed, disabling for this process:",
      error?.message || error
    );
    return new Map();
  }
}

module.exports = {
  RERANKER_WEIGHT,
  isRerankerEnabled: () => !disabled,
  computeRerankScores,
};
