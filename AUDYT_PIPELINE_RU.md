# Аудит pipeline ответов OfferKP

Дата: 2026-07-30  
Объект: текущее рабочее дерево `offer-ibm`, включая незакоммиченные изменения  
Цель: диагностируемый и максимально детерминированный pipeline для создания КП и общих вопросов по данным ShopDB

## 1. Итог

Система уже имеет сильное детерминированное ядро для:

- извлечения строк заявки;
- поиска SKU и товарных кандидатов в ShopDB;
- проверки технических ограничений;
- запрета неподтверждённых цен;
- построения PDF/DOCX из серверного черновика;
- сохранения всех строк исходной заявки даже при ошибках поиска.

Главная проблема находится выше и ниже matching-ядра:

1. **Intent не является единым решением для всего запроса.** Сообщение классифицируется повторно в нескольких модулях, а результат LLM tie-breaker используется не всеми потребителями.
2. **Общие вопросы по данным ShopDB в обычном чате фактически не поддержаны.** Значительная часть таких вопросов классифицируется как `out_of_scope` и получает немедленный отказ до обращения к базе.
3. **Есть несколько разных chat pipeline с разным поведением:** основной workspace stream, public stream, agent harness и отдельный admin DB Ask.
4. **Постобработка запускается после отправки основного текста пользователю.** Исправленный текст сохраняется в истории, но пользователь уже мог увидеть исходный текст.
5. **Детерминированный price gate не охватывает обычный LLM-chat так же строго, как agent/file pipeline.** Файлы КП защищены хорошо, но свободный текст до файлов защищён слабее.
6. Часть алгоритмов названа сильнее, чем реализована: текущие `LTR`, `Bayes`, `conformal`, `weak supervision` в основном эвристические; некоторые вычисления являются метаданными и не определяют top-1.
7. Наблюдаемость фрагментарна: нельзя по одному `request_id` восстановить intent → разрешения → SQL/search stages → кандидатов → выбор → цену → output gates → артефакты.

**Вердикт:** matching и генерация файлов ближе к production-grade, чем маршрутизация и диагностируемость. Для требуемого продукта сначала нужно сделать единый `IntentDecision` и отдельный детерминированный `data_question` pipeline. До этого добавление новых regex будет увеличивать покрытие примеров, но не устранит системные расхождения.

## 2. Что проверено

Проверены:

- `server/utils/chats/stream.js` — основной streaming chat;
- `server/utils/chats/offerKpPublic.js` — public chat;
- `server/utils/chats/generation.js` — enrichment и post-processing;
- `server/utils/offerKp/intentRouter.js`;
- `server/utils/offerKp/intentLlmJudge.js`;
- `server/utils/offerKp/quoteIntentJudge.js`;
- `server/utils/offerKp/enrich.js`;
- `server/utils/offerKp/catalogPrompt.js`;
- `server/utils/offerKp/groundedResponse.js`;
- `server/utils/offerKp/parseInquiry.js`;
- `server/utils/offerKp/productSearchAgent.js`;
- `server/utils/offerKp/shopDbSearch.js`;
- `server/utils/offerKp/searchAgent.js`;
- `server/utils/offerKp/nameSimilarity.js`;
- `server/utils/offerKp/embeddingSimilarity.js`;
- `server/utils/offerKp/matchInquiryLines.js`;
- `server/utils/offerKp/matching/*`;
- `server/utils/offerKp/autoQuoteArtifacts.js`;
- `server/utils/offerKp/quoteDbPriceGate.js`;
- `server/utils/offerKp/quoteComplianceChecker.js`;
- `server/utils/agentHarness/*`;
- `server/utils/offerKp/db/askAgent.js`;
- `server/utils/offerKp/db/explorer.js`;
- intent fixtures и ключевые regression/metamorphic тесты.

Запущены тесты:

```text
Test Suites: 8 passed, 8 total
Tests:       258 passed, 258 total
```

Проверены suites intent router, intent LLM judge, grounded response, matching stack, metamorphic, price gate, quote compliance и auto quote artifacts.

Важно: зелёные тесты подтверждают зафиксированное текущее поведение, но не доказывают поддержку общих вопросов к данным. В intent fixture есть 192 примера, однако практически нет запросов на агрегаты, статистику, категории, качество данных и структуру ShopDB.

## 3. Фактический pipeline каждого ответа

### 3.1. Основной workspace chat

Точка входа: `server/utils/chats/stream.js::streamChatWithWorkspace`.

Фактическая последовательность:

1. `grepCommand` нормализует slash/command-ввод.
2. `resolveOfferKpImmediateReply` синхронно вызывает rule-router.
3. Для `casual_or_test` и `out_of_scope` ответ формируется без LLM и без ShopDB; pipeline завершается.
4. Загружаются прикреплённые parsed files.
5. `routeOfferKpMessage` вычисляет rule intent.
6. Только для `ambiguous` вызывается `resolveOfferKpIntent`, который может применить LLM judge с `temperature: 0`.
7. Отдельно вычисляется `quoteDocumentRequest`:
   - phrase matcher;
   - признаки КП в attached text;
   - второй LLM yes/no judge в некоторых случаях.
8. Проверяются команды и agent invocation. Agent path может завершить основной chat pipeline досрочно.
9. Разрешается модель/провайдер.
10. Параллельно запускается ShopDB enrichment.
11. Если запрос не признан quote-document:
    - загружаются pinned docs;
    - выполняется vector similarity search;
    - выполняется backfill источников.
12. Parsed files всегда добавляются как недоверенный документ-контекст.
13. ShopDB enrichment возвращает:
    - catalog blocks;
    - sources;
    - flags;
    - optional `inquiryDraft`.
14. `applyExternalContextsForLlm` **повторно** вызывает rule-only `shouldRunShopEnrich(userPrompt)` и решает, разрешена ли инъекция catalog blocks.
15. При наличии draft в UI отправляется `offerKpQuotePanel`.
16. Для `product_inquiry` / `product_search` возможен server-rendered direct response без LLM.
17. Иначе собираются system prompt, user prompt, context, history и attachments.
18. LLM генерирует текст, который сразу стримится пользователю.
19. После завершения LLM запускается `runGenerationPipeline`:
    - optional Yandex fact-check;
    - optional OpenRouter fact-check;
    - optional style polish;
    - links/status footers.
20. При `catalogInjected || quoteDocumentRequest` запускается `emitAutoQuoteArtifacts`.
21. PDF/DOCX строятся из серверного draft, а не из свободного текста LLM.
22. Финальная версия сохраняется в `WorkspaceChats`.
23. Отправляется finalize event и, возможно, follow-up suggestions.

### 3.2. Public chat

Точка входа: `server/utils/chats/offerKpPublic.js::streamOfferKpPublicChat`.

Последовательность отличается:

1. Rule-only immediate reply.
2. Загрузка отдельной in-memory/session history.
3. `getShopDbContext`.
4. `applyExternalContextsForLlm`.
5. Direct grounded catalog response либо LLM.
6. Ответ сохраняется в public session.

В этом pipeline нет:

- общего `resolveOfferKpIntent` с LLM tie-breaker;
- vector/pinned document pipeline;
- `runGenerationPipeline`;
- auto quote artifact pipeline;
- общего request trace;
- одинакового набора output gates с agent harness.

Следствие: одинаковый текст может получить разный ответ в public и workspace chat.

### 3.3. Agent chat / AgentHarness

Agent pipeline является отдельной системой:

1. `OfferKpDocumentTriggerBlock` определяет запрос КП.
2. Для КП удаляются RAG/web tools.
3. Source verification фиксирует количество, порядок, единицы и позиции.
4. ShopDB catalog/draft добавляется в harness state.
5. Перед file tool:
   - source verification gate;
   - quote calculator;
   - server-side rebuild markdown из draft;
   - refresh цен из live ShopDB;
   - compliance check;
   - DB price check.
6. `sanitizeOutgoingChat` проверяет table prices и claims вида `Цена: N`.

Это наиболее строго защищённый pipeline, но он не является общей обязательной оболочкой для обычного workspace/public ответа.

### 3.4. Общие вопросы по данным: admin DB Ask

Отдельный endpoint: `POST /offerKp/db/ask`, только admin.

Pipeline:

1. LLM получает краткое описание схемы.
2. LLM генерирует SQL.
3. Regex-валидатор допускает read-only query.
4. SQL выполняется.
5. Второй LLM формулирует ответ по строкам результата.

Этот путь:

- не подключён к обычному OfferKP chat intent;
- доступен только admin UI;
- требует двух LLM-вызовов;
- не является максимально детерминированным;
- не использует единый intent/policy contract.

## 4. Матрица intent → фактическое поведение

| Primary intent | ShopDB | Vector/RAG | LLM | Мутация КП | Экспорт |
|---|---:|---:|---:|---:|---:|
| `casual_or_test` | нет | нет | нет | нет | нет |
| `out_of_scope` | нет | нет | нет | нет | нет |
| `unsafe_or_forbidden` | нет | зависит от точки входа, но policy запрещает | возможно отказ | нет | нет |
| `system_help` | нет | возможно | да | нет | нет |
| `document_question` | принудительно нет | parsed file да, vector зависит от `quoteDocumentRequest` | да | нет | нет |
| `product_inquiry` | да | обычно да, если не quote-document | часто direct server response | policy формально да | нет |
| `product_search` | да | обычно да | часто direct server response | только secondary intent | нет |
| `create_quote` | да | quote-document отключает vector | да + server artifacts | да | да |
| `edit_quote` | иногда через secondary signals | зависит от quote detection | да/agent | да | только regeneration |
| `ambiguous` | rule-policy нет; workspace может вызвать LLM judge | зависит от повторной классификации | да | зависит от judge | зависит от judge |

Проблема таблицы: это не одна state machine. Разные модули повторно выводят разрешения из исходного текста, поэтому фактическое поведение не всегда следует первичному `routedIntent`.

## 5. Реальный matching pipeline и алгоритмы

### 5.1. Извлечение заявки

`parseInquiryText`:

1. удаление шума messenger export;
2. OCR normalization;
3. распознавание table context;
4. split на строки/чанки;
5. извлечение:
   - названия;
   - стандарта;
   - размера/резьбы;
   - количества;
   - единицы измерения;
   - специальных требований.

Алгоритм rule-based и детерминированный.

### 5.2. Поиск кандидатов

Фактический приоритет:

1. Golden override по нормализованной полной строке.
2. Exact SKU через параметризованный SQL.
3. Structured SQL:
   - DIN/ГОСТ;
   - тип;
   - M×L / dimensions;
   - coating/strength и другие извлечённые поля.
4. Поиск по product fields.
5. Поиск по SKU.
6. Поиск по category.
7. Поиск по search index.
8. Fuzzy regex/LIKE fallback.
9. Name similarity:
   - TF-IDF;
   - cosine;
   - normalized Levenshtein;
   - Jaro-Winkler.
10. Optional embedding boost (`multilingual-e5-small`, CPU).
11. Optional LLM closed-set rank, по умолчанию выключен.
12. Optional cross-encoder reranker, по умолчанию выключен.

### 5.3. Классификация кандидата

`classifyProductMatch` присваивает:

- `exact`;
- `analog`;
- `similar`;
- `size_mismatch`;
- `size_unconfirmed`;
- `spec_mismatch`;
- `none`.

Проверяются:

- тип изделия;
- DIN/ГОСТ и разрешённые equivalence rules;
- диаметр;
- длина;
- pitch;
- coating;
- strength class;
- pin dimensions;
- наличие/цена.

Только `exact` и `analog` могут передать цену в строку КП.

### 5.4. Matching enrichment

Заявленный pipeline:

```text
blocking
→ hard/soft constraints
→ heuristic LTR
→ log-evidence “Bayes”
→ weak labels
→ selective/cost gate
→ heuristic conformal set
→ anomaly detection
→ active-learning priority
```

Фактическое влияние:

- blocking может удалить кандидатов;
- constraints могут демотировать match type;
- LTR сортирует кандидатов внутри match type;
- selective/cost gate может запретить auto-accept;
- hard OOD может запретить auto-accept;
- Bayes score участвует в cost gate;
- weak label сохраняется как metadata, но top-1 не выбирает;
- conformal set сохраняется как metadata для review;
- active-learning score сохраняется как metadata;
- окончательный `pickBestInquiryAlternative` сначала выбирает match-type pool, а среди нескольких `exact`/`analog` предпочитает более дешёвый похожий вариант.

Следовательно, нельзя описывать production decision просто как «LTR/Bayes выбрал товар». Истинная формула решения сложнее и должна логироваться целиком.

### 5.5. Цена и документы

1. Цена читается из live SKU rows.
2. `0` трактуется как неизвестная цена.
3. Для `similar`, mismatch и `none` цена запрещена.
4. Для non-piece units сумма не считается автоматически.
5. Перед agent file export цена может обновляться из live ShopDB.
6. Markdown проверяется на:
   - обязательные колонки;
   - числовые значения;
   - отсутствие formula placeholders;
   - корректность `qty × price`;
   - принадлежность цены allowed set из draft/catalog.
7. PDF/DOCX auto artifacts строятся из серверного draft.
8. Инвариант `N входных позиций = N строк КП` имеет safe fallback без цен.

Это самая сильная часть системы.

## 6. Детерминированность алгоритмов

| Компонент | Детерминированность | Комментарий |
|---|---|---|
| Intent regex router | высокая | При фиксированной версии кода |
| Immediate reply | высокая | Полностью rule-based |
| Inquiry parser | высокая | Rule-based |
| Golden override | высокая | При фиксированном golden set и live SKU |
| Exact/structured SQL | высокая | Нужен полный tie-break `ORDER BY` |
| TF-IDF/Levenshtein/Jaro | высокая | При фиксированном candidate pool |
| Heuristic LTR | высокая | Это linear scoring, не обученная модель |
| Constraints/analog graph | высокая | При фиксированной конфигурации |
| Price/compliance gates | высокая | Rule-based |
| Embedding boost | средняя | Модель детерминирована практически, но runtime может навсегда отключить boost после первой ошибки процесса |
| Cross-encoder | средняя | Optional; текущий код сортирует только по rerank score |
| Intent LLM judge | низкая/средняя | `temperature: 0` не гарантирует одинаковый результат между моделью/версией/backend |
| LLM closed-set rank | низкая | Кандидаты случайно перемешиваются через `Math.random()` |
| DB Ask SQL generation | низкая | SQL и final wording генерируются LLM |
| Chat generation | низкая | Свободная генерация |
| Fact-check/style polish | низкая | Дополнительные LLM-проходы |

### Что отключить или ограничить ради максимальной детерминированности

- `SHOP_DB_SEARCH_AGENT_LLM=0` оставить production default.
- `SHOP_DB_RERANKER_ENABLED=0`, пока нет фиксированной offline-оценки и calibrated threshold.
- Intent LLM judge использовать только после deterministic clarification policy, а не как невидимый action selector.
- Не использовать LLM для common data query → SQL.
- Не применять style/fact-check к коммерческим числам.
- Версионировать normalization, intent grammar, query plans, analog graph и scoring config.

## 7. Найденные проблемы

### P0. Общие вопросы по данным не проходят через обычный chat

Контрольные результаты текущего router:

| Вопрос | Текущий intent |
|---|---|
| «Сколько товаров в каталоге?» | `out_of_scope` |
| «Какие категории есть в базе?» | `out_of_scope` |
| «Какой товар самый дорогой?» | `out_of_scope` |
| «Есть ли дубликаты SKU?» | `out_of_scope` |
| «Сколько строк в ShopDB без цены?» | `out_of_scope` |
| «Расскажи о данных каталога» | `out_of_scope` |
| “What products are in the catalog?” | `out_of_scope` |
| “Ile produktów jest w katalogu?” | `out_of_scope` |
| «Какие покрытия встречаются у болтов?» | `ambiguous` |

`out_of_scope` перехватывается immediate reply до загрузки данных и возвращает отказ. Это прямо противоречит требованию «общие вопросы относительно этих данных тоже должны работать».

### P0. Split-brain intent

`stream.js` может получить resolved intent через LLM judge, но дальше:

- `collectExternalContexts → getShopDbContext → shouldRunShopEnrich` снова вызывает rule-router;
- `applyExternalContextsForLlm` снова вызывает `shouldRunShopEnrich(userPrompt)`;
- `productSearchAgent` снова вызывает rule-router;
- `groundedResponse` иногда получает resolved intent, иногда классифицирует сам;
- agent blocks имеют собственные quote detection/judges.

Пример класса ошибки:

```text
rule intent = ambiguous
→ LLM judge = product_search
→ верхний слой разрешил поиск
→ нижний shouldRunShopEnrich снова видит ambiguous
→ ShopDB не запускается / catalog blocks не инъектируются
```

Intent должен вычисляться один раз и передаваться вниз как immutable decision object.

### P0. Обычный chat не имеет такого же price-output gate, как agent

`AgentHarness.sanitizeOutgoingChat` проверяет:

- markdown-table prices;
- claims вида `Цена: N`;
- соответствие allowed prices.

Обычный workspace LLM response проходит через prompts и optional generic fact-check, но не через тот же обязательный OfferKP price sanitizer до отправки текста. Файлы КП безопаснее свободного текста ответа.

Требование должно быть единым: любой пользовательский канал и любой формат ответа, содержащий коммерческие числа, проходит один deterministic `CommercialClaimsGate`.

### P0/P1. Постобработка происходит после стрима

Основной текст отправляется через `getChatCompletion`/`handleStream`, затем вызывается `runGenerationPipeline`. Если fact-check или style polish изменил текст:

- пользователь уже получил исходный вариант;
- в БД может сохраниться изменённый вариант;
- UI и history расходятся;
- диагностика повторного ответа становится недостоверной.

Для коммерческих ответов правильный порядок:

```text
generate structured draft
→ validate/sanitize
→ render
→ stream validated render
```

Если нужен настоящий streaming, можно стримить только статус, а validated text отдавать после gate.

### P1. Несколько несовместимых pipeline

Workspace, public, agent и admin DB Ask используют разные:

- intent resolvers;
- контексты;
- output gates;
- storage;
- trace;
- artifact generation.

Общие функции есть, но нет одного orchestration contract. Диагностика по одному endpoint не переносится на другой.

### P1. `document_question` слишком узок, а `data_question` отсутствует

`document_question` принудительно запрещает ShopDB. Это правильно для вопроса «что написано в PDF», но не для:

- «какие из позиций PDF есть в базе?»;
- «сколько строк заявки имеют цену?»;
- «какие категории покрывает эта заявка?»;
- «почему эти позиции не сматчились?»;
- «покажи распределение статусов по черновику».

Нужен отдельный intent/action plan для вопросов по:

- attached source;
- current quote draft;
- ShopDB;
- сравнению source ↔ draft ↔ ShopDB.

### P1. Названия ML-слоёв создают ложное ощущение калибровки

- `learningToRank` — фиксированная линейная сумма ручных весов, не обученный LTR.
- `bayesianScore` — ручная сумма log-evidence, не калиброванная posterior probability.
- `conformalPrediction` прямо использует margin heuristics, а не split-conformal calibration.
- `targetCoverage: 0.95` не подтверждён calibration set.
- weak supervision labels не определяют top-1.
- active learning вычисляет приоритет, но сам по себе не создаёт learning loop.

Рекомендуемые честные имена до калибровки:

- `heuristicFeatureRanker`;
- `evidenceScore`;
- `heuristicCandidateSet`;
- `reviewPriority`.

### P1. Непоследовательные parser implementations

Есть как минимум два технических parser:

- `hardwareQuery.parseHardwareQuery`;
- `searchAgent.parseExtendedHardwareQuery`.

В текущем рабочем дереве основной parser уже понимает короткий `DIN 1`, но fallback parser всё ещё использует `DIN` длиной 3–5 цифр. Аналогичные расхождения возможны для dimensions, product types и normalization.

Должен быть один canonical `HardwareQueryAST`, используемый всеми search stages.

### P1. Optional algorithms меняют поведение процесса после runtime error

Embedding и cross-encoder при первой ошибке ставят process-global `disabled = true`. После этого одинаковый запрос в том же deployment может обрабатываться иначе, чем до ошибки.

Для диагностики нужно:

- писать `algorithm_availability_snapshot` в каждый trace;
- использовать circuit breaker с явным состоянием и TTL;
- не смешивать результаты запросов с разными algorithm profiles;
- включать profile/version в cache key.

### P1. Cross-encoder configuration не соответствует реализации

`RERANKER_WEIGHT` объявлен, но итоговая сортировка в `productSearchAgent` выполняется только по rerank score. Blend с исходным rank фактически не используется.

### P1. General DB Ask недостаточно детерминирован

Текущий natural-language DB Ask:

- LLM генерирует SQL;
- regex validator проверяет read-only;
- LLM формулирует ответ.

Для admin explorer это допустимый вспомогательный режим. Для основного продукта common data questions должны сначала компилироваться в allowlisted query plans. LLM SQL — только явно обозначенный fallback с показом SQL и подтверждением/ограничениями.

### P1. Trace не позволяет восстановить весь ответ

Сейчас:

- `ragTrace` содержит counts, но не полный intent decision;
- в основном stream flags ShopDB не всегда сохраняются полностью;
- `postProcessLog` возвращается, но не добавляется в локально собранный `ragTrace`;
- search metrics не имеют единого request id;
- нет полного списка candidate scores/gates;
- нет route version/config snapshot;
- нет связи chat response ↔ quote artifact ↔ price snapshot.

## 8. Целевой intent pipeline

### 8.1. Intent taxonomy

Рекомендуемый primary intent:

```text
CASUAL
SYSTEM_HELP
DATA_QUESTION
PRODUCT_LOOKUP
QUOTE_CREATE
QUOTE_EDIT
QUOTE_EXPORT
DOCUMENT_QUESTION
UNSAFE
OUT_OF_SCOPE
CLARIFY
```

`DATA_QUESTION` должен иметь subtype:

```text
catalog_row_lookup
catalog_aggregate
catalog_schema
draft_question
source_document_question
source_vs_draft
draft_vs_catalog
matching_diagnostics
```

Отдельно от intent должен существовать action plan:

```json
{
  "readSourceDocument": false,
  "readCurrentDraft": true,
  "queryShopDb": true,
  "mutateDraft": false,
  "exportQuote": false,
  "answerMode": "aggregate"
}
```

Один primary intent недостаточен для compound request. Нужен детерминированный список ordered actions.

### 8.2. Детерминированный порядок решений

```text
1. normalize
2. detect unsafe constraints
3. parse references: source / draft / catalog / export format
4. parse speech acts: ask / find / compare / mutate / create / export
5. parse product AST
6. parse data operation: list / count / min / max / avg / group / explain
7. build candidate intents
8. resolve precedence from explicit decision table
9. validate required slots
10. if slots missing → CLARIFY
11. build immutable IntentDecision + ActionPlan
12. execute actions
```

LLM не должен выбирать действие, которое меняет КП или запускает экспорт. Он может:

- предложить intent candidate;
- извлечь неизвестную формулировку в закрытую JSON schema;
- сформулировать clarification;
- перефразировать уже проверенный structured result.

### 8.3. Query plans для общих вопросов

Для максимальной детерминированности common questions компилируются в allowlisted plans:

```text
COUNT_PRODUCTS
COUNT_ACTIVE_PRODUCTS
LIST_CATEGORIES
COUNT_BY_CATEGORY
COUNT_SKUS_WITHOUT_PRICE
COUNT_DUPLICATE_SKUS
MIN_MAX_AVG_PRICE
TOP_BY_PRICE
STOCK_SUMMARY
LIST_DISTINCT_ATTRIBUTE
MATCH_STATUS_SUMMARY
DRAFT_TOTALS
DRAFT_MISSING_PRICES
EXPLAIN_MATCH_DECISION
```

Каждый plan:

- имеет JSON schema входных slots;
- строит параметризованный SQL;
- имеет фиксированный `ORDER BY`;
- имеет row/time limit;
- рендерится server-side;
- пишет plan id, params, SQL hash, row count и latency в trace.

LLM SQL используется только при `plan=UNSUPPORTED_ANALYTICS`, после read-only AST validation и с отдельным диагностическим флагом.

## 9. Целевой answer pipeline

```text
RequestEnvelope
  → Normalizer
  → IntentResolver
  → PolicyEngine
  → ActionPlanner
  → Data Executors
      ├─ SourceDocumentReader
      ├─ DraftReader/Mutator
      ├─ ShopDbQueryPlanExecutor
      └─ ProductMatcher
  → StructuredAnswer
  → CommercialClaimsGate
  → Renderer
  → ArtifactGate
  → Transport/SSE
  → Persistence
```

Ключевой принцип: transport не должен видеть непроверенный commercial text.

Для КП:

```text
parse source
→ N-line invariant
→ match each line
→ refresh price snapshot
→ calculate totals
→ validate draft
→ render text/PDF/DOCX/XLSX from the same immutable QuoteSnapshot
→ persist snapshot id
→ send artifacts
```

Для общих вопросов:

```text
parse data operation
→ execute allowlisted query plan
→ structured result
→ deterministic renderer
→ optional LLM paraphrase
→ claim verifier against structured result
→ send
```

## 10. Обязательный diagnostic trace

Для каждого ответа сохранять один JSON trace:

```json
{
  "requestId": "uuid",
  "channel": "workspace|public|agent|api",
  "routerVersion": "intent-v3",
  "normalizedInputHash": "...",
  "intent": {
    "primary": "data_question",
    "subtype": "catalog_aggregate",
    "confidence": 1,
    "source": "rule",
    "matchedRules": ["catalog_subject", "count_operator"],
    "alternatives": []
  },
  "policy": {},
  "actionPlan": [],
  "algorithms": {
    "profile": "deterministic-prod-v1",
    "embedding": "available|disabled|error",
    "crossEncoder": "disabled",
    "llmRank": "disabled"
  },
  "retrieval": {
    "queryPlan": "COUNT_ACTIVE_PRODUCTS",
    "sqlHash": "...",
    "candidateIds": [],
    "scores": [],
    "selectedId": null
  },
  "quote": {
    "sourceLineCount": 0,
    "draftLineCount": 0,
    "priceSnapshotId": null,
    "compliance": []
  },
  "generation": {
    "mode": "deterministic_render",
    "model": null,
    "temperature": null
  },
  "gates": {
    "commercialClaims": "passed",
    "sourceIntegrity": "not_applicable",
    "artifactCompliance": "not_applicable"
  },
  "latencyMs": {},
  "result": {
    "status": "ok",
    "responseHash": "..."
  }
}
```

Для product matching дополнительно:

- raw и normalized technical AST;
- candidate pool до/после каждого stage;
- lexical, embedding, LTR/evidence scores;
- constraint violations;
- match type до/после gate;
- причина abstain;
- выбранный SKU/product id;
- live price source row и timestamp;
- cache hit/profile.

## 11. Тестовая стратегия

### P0 tests

1. Contract tests: один resolved `IntentDecision` проходит через все consumers без повторной классификации.
2. Channel parity: workspace/public/agent одинаково классифицируют один input.
3. General data golden set минимум 100 запросов:
   - RU/PL/EN;
   - count/list/min/max/avg/group;
   - source/draft/catalog combinations;
   - paraphrases и word-order variants.
4. Commercial claim invariant для любого output format, не только markdown.
5. Stream invariant: до gate пользователю не отправляется commercial text.
6. Quote snapshot invariant: chat summary, PDF, DOCX и XLSX используют один snapshot id.

### Metamorphic tests

- смена регистра/пробелов/`х×x` не меняет plan;
- замена `сколько` → `какое количество` не меняет aggregate plan;
- смена `DIN 933` → `DIN 931` меняет query params;
- добавление «не создавай КП» запрещает mutation/export;
- перестановка кандидатов не меняет deterministic top-1;
- временная недоступность embedding не меняет exact/structured result;
- повторный запрос при одном catalog snapshot даёт тот же answer hash.

### Offline evaluation

Отдельно измерять:

- intent macro-F1 и critical false-positive rate;
- plan accuracy;
- retrieval recall@K;
- exact/analog precision;
- abstention precision/coverage;
- price claim violation rate;
- N-line preservation;
- channel parity;
- deterministic replay rate.

## 12. Приоритет реализации

### P0 — сначала

1. Ввести `IntentDecision`/`ActionPlan` и запретить downstream re-routing.
2. Добавить `DATA_QUESTION` с allowlisted query plans.
3. Перенести commercial output gate до отправки текста.
4. Не стримить непроверенный final answer.
5. Сделать один trace с `requestId`.
6. Подключить одинаковую core orchestration к workspace/public/agent.

### P1

1. Объединить technical parsers в `HardwareQueryAST`.
2. Переименовать эвристические ML-компоненты либо реально откалибровать их.
3. Исправить cross-encoder blend или удалить неиспользуемый `RERANKER_WEIGHT`.
4. Версионировать algorithm profiles и cache keys.
5. Добавить deterministic replay CLI по сохранённому trace.

### P2

1. Обучить настоящий LTR только после накопления качественных operator labels.
2. Построить split-conformal calibration set.
3. Включать cross-encoder только после offline A/B.
4. Оставить LLM SQL как явно маркированный fallback для нестандартной аналитики.

## 13. Критерий готовности

Система готова к диагностируемому production-режиму, когда для любого ответа можно однозначно ответить:

1. Какой intent и action plan были выбраны?
2. Каким правилом и какой версией?
3. Какие источники были разрешены?
4. Какой exact SQL/query plan выполнился?
5. Какие кандидаты рассматривались и почему выбран этот SKU?
6. Откуда взята каждая цена?
7. Какие gates сработали?
8. Какой единый snapshot использовали текст и файлы?
9. Что реально увидел пользователь?
10. Можно ли воспроизвести тот же результат без LLM?

Сейчас на вопросы 1–2, 4–5, 7 и 9 нельзя стабильно ответить по одному сохранённому trace. Именно это является главным препятствием для быстрой диагностики проблем.
