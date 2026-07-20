"use strict";

/**
 * Few-shot retrieval z golden setu dla LLM-fallbacku matchingu
 * (searchAgent.pickProductsWithLlm). Nie trenuje niczego — dobiera k
 * najbardziej semantycznie podobnych, już potwierdzonych przez operatora
 * przykładów z test_files/*.expected.csv (goldenCorrections.js, kolumny
 * matched_sku/matched_name/match_type) i wstrzykuje je do prompta jako
 * punkt odniesienia. Im więcej przykładów w golden secie, tym trafniejsze
 * podpowiedzi dla LLM — to jest "uczenie się" bez fine-tuningu.
 *
 * Reużywa embedding z embeddingSimilarity.js (ten sam model/cache co
 * reranking w nameSimilarity.js). Każdy błąd (embedding wyłączony/padł)
 * daje po prostu pustą listę przykładów — prompt wygląda tak jak dziś.
 */

const { listMatchExamples } = require("./goldenCorrections");
const { computeEmbeddingSimilarities } = require("./embeddingSimilarity");

const MAX_EXAMPLES = Math.max(
  0,
  parseInt(process.env.SHOP_DB_FEW_SHOT_EXAMPLES, 10) || 3
);
const MIN_SIMILARITY = Math.min(
  1,
  Math.max(0, Number(process.env.SHOP_DB_FEW_SHOT_MIN_SIMILARITY || 0.55))
);

// Namespaced ids so golden-example vectors never collide in the shared
// embedding cache with numeric ShopDB product ids.
function goldenCandidateId(example, index) {
  return `golden:${example.sourceFile}:${index}`;
}

/**
 * @param {string} searchText
 * @returns {Promise<Array<{sourceName:string, matchedName:string|null, sku:string|null, matchType:string}>>}
 */
async function retrieveFewShotExamples(searchText) {
  if (!MAX_EXAMPLES || !searchText) return [];
  const examples = listMatchExamples();
  if (!examples.length) return [];

  try {
    const candidates = examples.map((ex, i) => ({
      id: goldenCandidateId(ex, i),
      name: ex.sourceName,
    }));
    const similarities = await computeEmbeddingSimilarities(
      searchText,
      candidates
    );
    if (!similarities.size) return [];

    return examples
      .map((ex, i) => ({
        ex,
        score: similarities.get(goldenCandidateId(ex, i)) || 0,
      }))
      .filter((row) => row.score >= MIN_SIMILARITY)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_EXAMPLES)
      .map((row) => row.ex);
  } catch (error) {
    console.error(
      "[GoldenFewShot] retrieval failed, continuing without examples:",
      error?.message || error
    );
    return [];
  }
}

function formatFewShotBlock(examples = []) {
  if (!examples.length) return "";
  const lines = examples.map(
    (ex) =>
      `- Запрос: "${ex.sourceName}" → выбрано: ${
        ex.matchedName || `SKU ${ex.sku}`
      }${ex.matchType === "analog" ? " (аналог)" : ""}`
  );
  return [
    "Ранее оператор подтвердил такие сопоставления похожих позиций " +
      "(ориентир, не копируй бездумно, если текущий запрос отличается по сути):",
    ...lines,
  ].join("\n");
}

module.exports = {
  retrieveFewShotExamples,
  formatFewShotBlock,
};
