#!/usr/bin/env node
"use strict";

/**
 * Агрегирует непрерывный лог retrieval-метрик ShopDB matching
 * (server/utils/offerKp/searchMetrics.js -> storage/metrics/shopdb-search.jsonl,
 * пишется на каждый matchInquiryLine в проде) и печатает отчёт за окно
 * времени. Это "мониторинг", а не разовый снимок golden set — см.
 * scripts/measure-shopdb-search-quality.cjs для последнего.
 *
 * Вызывается из `offerkp metrics` (cli/metrics.go) по SSH на Lainey, но
 * работает и локально.
 *
 * Запуск: node scripts/report-shopdb-metrics.cjs [--hours N] [--tail N]
 */

const fs = require("fs");
const path = require("path");

process.chdir(path.resolve(__dirname, "../server"));
const { loadEnv } = require("../server/config/loadEnv");
loadEnv();

const { METRICS_FILE, isMetricsEnabled } = require("../server/utils/offerKp/searchMetrics");

function parseArgs(argv) {
  const args = { hours: 24, tail: 10 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--hours" && argv[i + 1]) {
      args.hours = Math.max(1, parseInt(argv[i + 1], 10) || 24);
      i++;
    } else if (argv[i] === "--tail" && argv[i + 1]) {
      args.tail = Math.max(0, parseInt(argv[i + 1], 10) || 10);
      i++;
    }
  }
  return args;
}

function readAllLines() {
  const files = [`${METRICS_FILE}.1`, METRICS_FILE].filter((f) =>
    fs.existsSync(f)
  );
  const lines = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8").trim();
    if (!raw) continue;
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        lines.push(JSON.parse(line));
      } catch {
        /* skip malformed line */
      }
    }
  }
  return lines;
}

function pct(n, total) {
  return total ? `${((n / total) * 100).toFixed(1)}%` : "n/a";
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!isMetricsEnabled()) {
    console.log(
      "Сбор метрик выключен (SHOP_DB_METRICS_ENABLED=0) — нечего показывать."
    );
    process.exit(0);
  }

  const all = readAllLines();
  const sinceMs = Date.now() - args.hours * 60 * 60 * 1000;
  const events = all.filter((e) => {
    const t = Date.parse(e.ts);
    return Number.isFinite(t) && t >= sinceMs;
  });

  console.log(`Файл метрик: ${METRICS_FILE}`);
  console.log(`Всего записей в логе: ${all.length}, за последние ${args.hours}ч: ${events.length}\n`);

  if (!events.length) {
    console.log("Нет данных за это окно. Метрики пишутся при каждом вызове matchInquiryLine в проде.");
    if (args.tail && all.length) {
      console.log(`\nПоследние ${Math.min(args.tail, all.length)} записей (вне окна):`);
      all.slice(-args.tail).forEach((e) => console.log(JSON.stringify(e)));
    }
    process.exit(0);
  }

  const byMatchType = {};
  const byStrategy = {};
  let withPrice = 0;
  let candidateSum = 0;
  let errorCount = 0;

  for (const e of events) {
    byMatchType[e.matchType] = (byMatchType[e.matchType] || 0) + 1;
    if (e.matchType === "error") errorCount++;
    if (e.hasPrice) withPrice++;
    candidateSum += Number(e.candidateCount) || 0;
    for (const s of e.strategies || []) {
      byStrategy[s] = (byStrategy[s] || 0) + 1;
    }
  }

  console.log("=== По matchType ===");
  for (const [type, count] of Object.entries(byMatchType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(16)} ${String(count).padStart(5)}  (${pct(count, events.length)})`);
  }

  console.log("\n=== По стратегии поиска (событие может задеть несколько) ===");
  if (!Object.keys(byStrategy).length) {
    console.log("  (нет данных о стратегиях)");
  } else {
    for (const [strat, count] of Object.entries(byStrategy).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${strat.padEnd(20)} ${String(count).padStart(5)}  (${pct(count, events.length)} запросов)`);
    }
  }

  console.log("\n=== Сводка ===");
  console.log(`  С ценой (exact/analog):     ${pct(withPrice, events.length)}`);
  console.log(`  Ошибки поиска:              ${pct(errorCount, events.length)}`);
  console.log(`  Среднее кандидатов/запрос:  ${(candidateSum / events.length).toFixed(1)}`);
  console.log(`  golden_override сработал:   ${pct(byStrategy.golden_override || 0, events.length)}`);
  console.log(`  llm_rank потребовался:      ${pct(byStrategy.llm_rank || 0, events.length)}`);

  process.exit(0);
}

main();
