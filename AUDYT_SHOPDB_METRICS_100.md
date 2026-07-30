# ShopDB random-100 audit metrics

Дата: 2026-07-30  
Скрипт: `scripts/audit-shopdb-random-sample.cjs`  
Seed: `offerkp-2026` · sample: 100  
Коммит rerank: `954d1bd` (`feat(offerKp): rerank Top-50→Top-1 + AutoAccept metrics`)

## 1. Baseline (до Orama BM25 / до Top-50 rerank)

Полностью завершённый аудит 100 продуктов:

| Метрика | Значение |
|--------|----------|
| DBQueryAttemptRate | 100/100 (100%) |
| DBQuerySuccessRate | 100/100 (100%) |
| Recall@50 | 99% |
| Top-1 accuracy | 73% |
| False exact | 0 |
| Unconfirmed SKU/price | 0 |

**Вывод baseline:** retrieval сильный (правильный SKU в Top-50 почти всегда). Узкое место — порядок кандидатов Top-50 → Top-1 (73%).

Аудит сразу после внедрения Orama BM25 был прерван до summary — честных post-Orama цифр нет.

## 2. Новые метрики (после 954d1bd)

Скрипт теперь печатает дополнительно:

| Метрика | Определение | Prod target |
|--------|-------------|-------------|
| AutoAcceptRate | auto-accept / все запросы | ≈ Coverage |
| AutoAcceptPrecision | корректные auto-accept / все auto-accept | ≥ 98–99% |
| AutoAcceptCoverage | все auto-accept / все запросы | 75–90% |
| Top1Accuracy | retrieval rank == 1 | ≥ 85% |
| FalseExactRate | wrong exact / exact decisions | < 1% |
| UnconfirmedSkuOrPriceRate | SKU/цена не из live ShopDB | 0% (100% grounding) |

**Auto-accept** = `exact|analog` без `Требует проверки` / `Требуется проверка` / `reviewReason`.

Почему нужны AutoAccept*:
- FalseExact = 0 легко получить, слив все трудные кейсы в NEEDS_REVIEW.
- Precision ловит опасные авто-цены; Coverage — долю автоматизации.

При N=100 нулевой FalseExact ≠ нулевой риск: ориентир верхней границы ошибки ~3%. След. аудит: 500–1000 SKU + hard negatives.

## 3. Pipeline после фикса (Top-50 → Top-1)

```
Top-50 retrieval (BM25 + dense + SQL → RRF)
  → hard param filters (diameter / length / standard)
  → BM25F boosts (sku=10, size=8, standard=7, …)
  → LTR + identity Top-10 rerank (`matching/top50Rerank.js`)
  → margin Top-1 vs identity-rival
  → accept OR NEEDS_REVIEW
```

Env:
- `OFFER_KP_RERANK_TOP_K` (default 10)
- `OFFER_KP_RERANK_MARGIN` (default 0.15)
- `SHOP_DB_BM25=1`

JSONL prod: `autoAccepted`, `rerankMargin` в `searchMetrics` → `offerkp metrics` / `report-shopdb-metrics.cjs`.

## 4. Post-rerank 100-run (2026-07-30)

**Статус: не завершён.** Полный локальный прогон `node scripts/audit-shopdb-random-sample.cjs --sample 100 --seed offerkp-2026` слишком долгий (embedding/BM25/index на каждый из 100 × matchInquiryLine); прерван до JSON summary.

Итого честных цифр «после Orama + Top-50 rerank» на тех же 100 пока нет. Сравнивать только:

- baseline §1 (готово),
- schema новых метрик §2 (в коде),
- следующий полный прогон на Lainey / с тёплым catalog index.

Команда повторного прогона на сервере (после `yarn deploy:lainey`):

```bash
cd /opt/offer-ibm   # или актуальный deploy root
node scripts/audit-shopdb-random-sample.cjs --sample 100 --seed offerkp-2026
```

Результат вставить сюда в §4 и обновить graphify snapshot.

## 5. Связанные файлы

- `scripts/audit-shopdb-random-sample.cjs`
- `scripts/report-shopdb-metrics.cjs`
- `server/utils/offerKp/matching/top50Rerank.js`
- `server/utils/offerKp/matching/index.js`
- `server/utils/offerKp/shopDbBm25Index.js`
- `server/utils/offerKp/searchMetrics.js`
- `server/__tests__/utils/offerKp/top50Rerank.test.js`
