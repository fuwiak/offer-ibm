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

## 4. Post-rerank 100-run на Lainey (2026-07-30)

**Статус: завершён.** Host `87.228.90.43`, app `/opt/offer-kp/app`, READY≈`890afca`, index warm: products=bm25=vectors=19764.

```bash
cd /opt/offer-kp/app
node scripts/audit-shopdb-random-sample.cjs --sample 100 --seed offerkp-2026
# → /opt/offer-kp/data/audit-100-offerkp-2026.json
```

| Метрика | Baseline | Lainey post-rerank |
|--------|----------|-------------------|
| DBQueryAttemptRate | 100% | **100%** |
| DBQuerySuccessRate | 100% | **100%** |
| Recall@50 | 99% | **92%** ↓ |
| Top-1 accuracy | 73% | **91%** ↑ |
| AutoAcceptRate / Coverage | — | **80%** |
| AutoAcceptPrecision | — | **100%** (80/80) |
| FalseExactRate (raw script) | 0% | 7.69%* |
| UnconfirmedSkuOrPriceRate | 0% | 7.69%* |

\*Сырой FalseExact/Unconfirmed завышены: 7 строк с `matchType=exact`, пустым `productId`, `reviewReason=retriever_disagreement` (цена не назначена). Это NEEDS_REVIEW, не wrong priced exact. Среди **auto-accept** ложных нет (precision 100%).

Сырой JSON: `graphify-audits/shopdb-metrics-100/audit-100-offerkp-2026.json`.

**Вердикт:** Top-1 73→91 и AutoAccept 80%@100% precision — automation target hit. Recall@50 99→92 и disagreement-abstentions — смотреть отдельно.

## 5. Follow-up (2026-07-30 evening)

Reranker kept. Candidate generation widened:

- `SHOP_DB_RETRIEVAL_WINDOW` default **100**
- BM25 topK default **80**, dense rescue/ANN default **80**
- RRF quota **90 compatible + 10 analog**
- matchInquiryLine / audit consume Top‑100

Exact contract: `enforceExactGroundingContract` — `exact` without `productId` or with `retrieverDisagreement` → `none` + NEEDS_REVIEW + `allowPrice=false`.

Audit metrics renamed/split:

- `InvalidExactState` / `WrongGroundedExact` / `WrongPricedExact`
- `ExactWithoutProductId` / `ExactWithoutSku` / `ExactWithoutPrice` / `SkuPriceContradictsShopDb`
- `RecallAt100` + `RerankGivenRecall` (Top‑1 / Recall@100)

### Lainey re-run after widen (`108d98c`, seed `offerkp-2026`)

Artifact: `graphify-audits/shopdb-metrics-100/audit-100-post-widen.json`

| Метрика | Post-rerank (до widen) | После Top‑100 + contract |
|--------|------------------------|---------------------------|
| Recall@50 | 92% | **92%** (без изменения) |
| Recall@100 | — | **92%** (= @50 → 8 miss не в окне) |
| Top‑1 | 91% | **91%** |
| RerankGivenRecall | ~98.9% | **98.91%** |
| AutoAcceptCoverage | 80% | **80%** |
| AutoAcceptPrecision | 100% | **100%** |
| InvalidExactState | 7 (сырой exact без id) | **0** ✓ |
| WrongGroundedExact | — | **0** ✓ |
| WrongPricedExact | — | **0** ✓ |
| SkuPriceContradictsShopDb | 7 (артефакт) | **0** ✓ |
| exactDecisions | 91 | **84** (−7 demoted) |

**Вердикт re-run:** контракт exact и grounding-метрики исправлены. Widen Top‑50→100 **не** поднял Recall на этом seed — 8 missing нет и в Top‑100 (дырка в candidate generation / hard filters / indexing, не в размере окна). След. рычаг: почему эти 8 не попадают в SQL∪BM25∪dense.

## 6. Связанные файлы

- `scripts/audit-shopdb-random-sample.cjs`
- `scripts/report-shopdb-metrics.cjs`
- `server/utils/offerKp/matching/top50Rerank.js`
- `server/utils/offerKp/matching/index.js`
- `server/utils/offerKp/shopDbBm25Index.js`
- `server/utils/offerKp/nameSimilarity.js`
- `server/utils/offerKp/productSearchAgent.js`
- `server/utils/offerKp/matchInquiryLines.js` (`enforceExactGroundingContract`)
- `server/utils/offerKp/searchMetrics.js`
- `server/__tests__/utils/offerKp/top50Rerank.test.js`

