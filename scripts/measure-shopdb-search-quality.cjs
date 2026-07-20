#!/usr/bin/env node
"use strict";

/**
 * Измеряет качество ShopDB-поиска (matching) на верифицированных строках
 * golden set (test_files/*.expected.csv с колонками matched_sku/match_type —
 * см. AUDYT.md §6.4). НЕ трогает golden-override — вызывает
 * runProductSearchAgent напрямую, чтобы измерить именно качество живого
 * поиска (SQL/TF-IDF/embedding/LLM-фолбэк), а не эффект override-таблицы.
 *
 * С малым числом примеров (сейчас 7) это не статистически значимая
 * калибровка порогов — это базовый, честный снимок текущего качества,
 * который можно перезапускать по мере роста golden set.
 *
 * Запуск: node scripts/measure-shopdb-search-quality.cjs
 */

const path = require("path");

process.chdir(path.resolve(__dirname, "../server"));
const { loadEnv } = require("../server/config/loadEnv");
loadEnv();

const { listMatchExamples } = require("../server/utils/offerKp/goldenCorrections");
const {
  runProductSearchAgent,
  searchByExactSku,
} = require("../server/utils/offerKp/productSearchAgent");

function rankOf(products, expectedId) {
  const idx = products.findIndex((p) => String(p.id) === String(expectedId));
  return idx === -1 ? null : idx + 1;
}

async function main() {
  const examples = listMatchExamples();
  if (!examples.length) {
    console.log(
      "Нет верифицированных примеров в golden set (matched_sku не заполнен ни в одном .expected.csv)."
    );
    process.exit(0);
  }

  console.log(`Golden-примеров с проверенным SKU: ${examples.length}\n`);

  let top1 = 0;
  let top5 = 0;
  let noneFound = 0;
  const rows = [];

  for (const ex of examples) {
    const hits = await searchByExactSku([ex.sku], 1);
    if (!hits.length) {
      rows.push({ ...ex, rank: "SKU не найден в ShopDB (устарел?)" });
      continue;
    }
    const expectedId = hits[0].id;

    const { products } = await runProductSearchAgent({
      message: ex.sourceName,
      limit: 8,
    });

    const rank = rankOf(products, expectedId);
    if (rank === 1) top1 += 1;
    if (rank !== null && rank <= 5) top5 += 1;
    if (rank === null) noneFound += 1;

    rows.push({
      sourceName: ex.sourceName.slice(0, 60),
      expectedId,
      rank: rank === null ? "не в топ-8" : `#${rank}`,
      hits: products.length,
    });
  }

  console.log("Строка запроса (сокр.) | ожидаемый id | место в выдаче | всего кандидатов");
  console.log("-".repeat(100));
  for (const r of rows) {
    console.log(
      `${(r.sourceName || "").padEnd(60)} | ${String(r.expectedId ?? "-").padEnd(12)} | ${String(r.rank).padEnd(14)} | ${r.hits ?? "-"}`
    );
  }

  const total = examples.length;
  console.log("\n=== Итог ===");
  console.log(`accuracy@1: ${top1}/${total} (${((top1 / total) * 100).toFixed(0)}%)`);
  console.log(`accuracy@5: ${top5}/${total} (${((top5 / total) * 100).toFixed(0)}%)`);
  console.log(`не найдено вообще: ${noneFound}/${total}`);
  if (total < 30) {
    console.log(
      "\nВНИМАНИЕ: выборка маленькая (< 30) — это снимок, не статистически значимая калибровка. " +
        "Пополняйте golden set (AUDYT.md §6.1/§6.4) и перезапускайте."
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Ошибка измерения:", err?.message || err);
  process.exit(1);
});
