"use strict";

const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const {
  pinTransformersCacheEnv,
} = require("../EmbeddingEngines/native/modelDiskCache");

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
 * Модель: multilingual mMARCO MiniLMv2 L6 (русский входит в обучающие языки),
 * оптимизированная ONNX-конвертация от Slite. Она заметно легче прежнего
 * Xenova/bge-reranker-base и работает CPU-only, не трогая GPU/LM Studio/T4.
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
  process.env.SHOP_DB_RERANKER_MODEL ||
  "Slite/mmarco-mMiniLMv2-L6-H384-v1-onnx-o4";
const USING_DEFAULT_MINILM =
  RERANKER_MODEL === "Slite/mmarco-mMiniLMv2-L6-H384-v1-onnx-o4";
const RERANKER_MODEL_FILE =
  process.env.SHOP_DB_RERANKER_MODEL_FILE ||
  (USING_DEFAULT_MINILM ? "model_optimized.onnx" : null);
const RERANKER_QUANTIZED = envFlagEnabled(
  "SHOP_DB_RERANKER_QUANTIZED",
  !USING_DEFAULT_MINILM
);
const RERANKER_MODEL_REVISION =
  process.env.SHOP_DB_RERANKER_MODEL_REVISION || "main";
const MAX_RERANK_CANDIDATES = Math.max(
  1,
  parseInt(process.env.SHOP_DB_RERANKER_MAX_CANDIDATES, 10) || 5
);
// Насколько сильно cross-encoder-скор перевешивает исходный (lexical/embedding)
// ранг при итоговой сортировке — 1 значит "полностью доверяем reranker'у".
const RERANKER_WEIGHT = Math.min(
  1,
  Math.max(0, Number(process.env.SHOP_DB_RERANKER_WEIGHT ?? 0.7))
);

let modelPromise = null;
let ensureMiniLmDownloadPromise = null;
let disabled = !RERANKER_ENABLED;

function modelCacheRoot() {
  return process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR, "models")
    : path.resolve(__dirname, "../../storage/models");
}

function modelCachePath() {
  return path.resolve(
    modelCacheRoot(),
    ...RERANKER_MODEL.split("/"),
    RERANKER_MODEL_FILE
  );
}

async function ensureMiniLmModelFile() {
  const target = modelCachePath();
  if (fs.existsSync(target) && fs.statSync(target).size > 1_000_000) {
    console.log(
      `[CrossEncoderRerank] cache hit: ${RERANKER_MODEL_FILE} (${fs.statSync(target).size} bytes)`
    );
    return target;
  }

  if (!ensureMiniLmDownloadPromise) {
    ensureMiniLmDownloadPromise = (async () => {
      console.log(
        `[CrossEncoderRerank] download: fetching ${RERANKER_MODEL_FILE} → ${target}`
      );
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const url =
        `https://huggingface.co/${RERANKER_MODEL}/resolve/` +
        `${encodeURIComponent(RERANKER_MODEL_REVISION)}/${RERANKER_MODEL_FILE}`;
      const response = await fetch(url);
      if (!response.ok || !response.body) {
        throw new Error(
          `Failed to download ${RERANKER_MODEL}: HTTP ${response.status}`
        );
      }

      const temporary = `${target}.download-${process.pid}`;
      try {
        await pipeline(
          Readable.fromWeb(response.body),
          fs.createWriteStream(temporary, { flags: "w" })
        );
        fs.renameSync(temporary, target);
      } catch (error) {
        fs.rmSync(temporary, { force: true });
        throw error;
      }
      return target;
    })().finally(() => {
      ensureMiniLmDownloadPromise = null;
    });
  }
  return ensureMiniLmDownloadPromise;
}

async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { AutoTokenizer, AutoModelForSequenceClassification, env } =
        await import("@xenova/transformers");
      const cache_dir = modelCacheRoot();
      pinTransformersCacheEnv(env, cache_dir);
      const tokenizer = await AutoTokenizer.from_pretrained(RERANKER_MODEL, {
        cache_dir,
      });

      if (USING_DEFAULT_MINILM) {
        const ort = require("onnxruntime-node-modern");
        const modelPath = await ensureMiniLmModelFile();
        const session = await ort.InferenceSession.create(modelPath, {
          executionProviders: ["cpu"],
        });
        return { tokenizer, session, ort };
      }

      const model = await AutoModelForSequenceClassification.from_pretrained(
        RERANKER_MODEL,
        {
          quantized: RERANKER_QUANTIZED,
          cache_dir,
          ...(RERANKER_MODEL_FILE
            ? { model_file_name: RERANKER_MODEL_FILE }
            : {}),
        }
      );
      return { tokenizer, model };
    })();
  }
  return modelPromise;
}

async function runModel(modelBundle, inputs) {
  if (!modelBundle.session) {
    const { logits } = await modelBundle.model(inputs);
    return logits.tolist().map((row) => row[0]);
  }

  const feeds = {};
  for (const name of modelBundle.session.inputNames) {
    const input = inputs[name];
    if (!input) throw new Error(`Reranker input is missing: ${name}`);
    feeds[name] = new modelBundle.ort.Tensor(
      input.type,
      input.data,
      input.dims
    );
  }
  const outputs = await modelBundle.session.run(feeds);
  const logits = outputs.logits || outputs[modelBundle.session.outputNames[0]];
  return Array.from(logits.data);
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
    const modelBundle = await loadModel();
    const { tokenizer } = modelBundle;
    const queries = pool.map(() => text);
    const passages = pool.map((c) => String(c.name || "").trim());

    const inputs = tokenizer(queries, {
      text_pair: passages,
      padding: true,
      truncation: true,
    });
    const logits = await runModel(modelBundle, inputs);
    const scores = logits.map(sigmoid);

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
  getRerankerConfig: () => ({
    enabled: !disabled,
    model: RERANKER_MODEL,
    modelFile: RERANKER_MODEL_FILE,
    quantized: RERANKER_QUANTIZED,
    revision: RERANKER_MODEL_REVISION,
    maxCandidates: MAX_RERANK_CANDIDATES,
  }),
  isRerankerEnabled: () => !disabled,
  computeRerankScores,
};
